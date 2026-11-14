import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type { z } from 'zod';
import { InstrumentPageResponse } from '../src/instruments/instruments.schemas';
import { OrderResponse } from '../src/orders/orders.schemas';
import { PortfolioResponse } from '../src/portfolio/portfolio.schemas';
import { ProblemDetailsSchema } from '../src/shared/http/openapi';
import { closeTestDataSource, loadChallengeSeed, resetDb } from './helpers/db';
import { cashIn, createInstrument, createOrder, createUser } from './helpers/factories';
import { buildTestApp } from './helpers/test-app';

/**
 * Principio VI: el OpenAPI se genera desde estos schemas, así que las respuestas reales tienen
 * que cumplirlos. Además de validar, se compara el resultado parseado con el body original: zod
 * descarta las claves que no declara, así un campo de más en la API también hace fallar el test.
 */
function conforms(schema: z.ZodType, body: unknown): void {
  const result = schema.safeParse(body);
  expect(result.success ? [] : result.error.issues).toEqual([]);
  expect(result.success ? result.data : undefined).toEqual(body);
}

let app: Express;
let ds: DataSource;
let keySeq = 0;

beforeEach(async () => {
  ({ app, dataSource: ds } = await buildTestApp());
  await resetDb(ds);
  await loadChallengeSeed(ds);
});
afterAll(closeTestDataSource);

const getBody = async (path: string) => (await request(app).get(path)).body as unknown;
const send = (body: object) =>
  request(app)
    .post('/v1/orders')
    .set('Idempotency-Key', `contract-key-${++keySeq}`)
    .send({ userId: 1, instrumentId: 47, currency: 'ARS', side: 'BUY', ...body });

describe('GET /v1/users/:userId/portfolio cumple PortfolioResponse', () => {
  it('usuario 1 del seed (posiciones con precio)', async () => {
    const body = await getBody('/v1/users/1/portfolio');
    conforms(PortfolioResponse, body);
    expect((body as { positions: unknown[] }).positions.length).toBeGreaterThan(0);
  });

  it('usuario sin órdenes', async () => {
    const userId = await createUser(ds);
    const body = await getBody(`/v1/users/${userId}/portfolio`);
    conforms(PortfolioResponse, body);
    expect((body as { positions: unknown[] }).positions).toEqual([]);
  });

  it('posición de un instrumento sin precio de mercado (campos en null)', async () => {
    const userId = await createUser(ds);
    const instrumentId = await createInstrument(ds, { ticker: 'NOPRICE' });
    await cashIn(ds, userId, 10000);
    await createOrder(ds, {
      userId,
      instrumentId,
      side: 'BUY',
      status: 'FILLED',
      size: 5,
      price: '100',
    });

    const body = (await getBody(`/v1/users/${userId}/portfolio`)) as {
      positions: { ticker: string; lastPrice: unknown; marketValue: unknown }[];
    };

    conforms(PortfolioResponse, body);
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0]).toMatchObject({
      ticker: 'NOPRICE',
      lastPrice: null,
      marketValue: null,
    });
  });
});

describe('GET /v1/instruments cumple InstrumentPageResponse', () => {
  it('primera página, última página y búsqueda vacía', async () => {
    const first = (await getBody('/v1/instruments?q=s&limit=5')) as {
      page: { nextCursor: string | null };
    };
    conforms(InstrumentPageResponse, first);
    expect(first.page.nextCursor).not.toBeNull();

    let cursor = first.page.nextCursor;
    let last: unknown = first;
    while (cursor) {
      last = await getBody(`/v1/instruments?q=s&limit=5&cursor=${cursor}`);
      conforms(InstrumentPageResponse, last);
      cursor = (last as { page: { nextCursor: string | null } }).page.nextCursor;
    }
    expect((last as { page: { hasMore: boolean } }).page.hasMore).toBe(false);

    const empty = await getBody('/v1/instruments?q=zzzz');
    conforms(InstrumentPageResponse, empty);
    expect((empty as { data: unknown[] }).data).toEqual([]);
  });

  it('un instrumento sin precio devuelve lastPrice null y cumple el schema', async () => {
    await createInstrument(ds, { ticker: 'NOPRICE2' });
    const body = (await getBody('/v1/instruments?q=NOPRICE2')) as {
      data: { ticker: string; lastPrice: unknown }[];
    };
    conforms(InstrumentPageResponse, body);
    expect(body.data[0]).toMatchObject({ ticker: 'NOPRICE2', lastPrice: null });
  });
});

describe('las órdenes cumplen OrderResponse', () => {
  it('FILLED, NEW, REJECTED, el replay (200) y la cancelación', async () => {
    const filled = await send({ type: 'MARKET', quantity: 1 });
    const limit = await send({ type: 'LIMIT', quantity: 2, price: '900' });
    const rejected = await send({ type: 'MARKET', quantity: 100000 });
    const replay = await request(app)
      .post('/v1/orders')
      .set('Idempotency-Key', `contract-key-${keySeq}`)
      .send({
        userId: 1,
        instrumentId: 47,
        currency: 'ARS',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100000,
      });
    const cancelled = await request(app)
      .post(`/v1/orders/${(limit.body as { id: number }).id}/cancellation`)
      .send({ userId: 1 });

    expect([filled.status, limit.status, rejected.status, replay.status, cancelled.status]).toEqual(
      [201, 201, 201, 200, 200],
    );
    expect(filled.body).toMatchObject({ status: 'FILLED' });
    expect(limit.body).toMatchObject({ status: 'NEW' });
    expect(rejected.body).toMatchObject({ status: 'REJECTED' });
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED' });
    for (const res of [filled, limit, rejected, replay, cancelled]) {
      conforms(OrderResponse, res.body);
    }
  });
});

describe('los errores cumplen ProblemDetails y su `status` coincide con el HTTP', () => {
  function expectProblem(res: request.Response, status: number, code: string): void {
    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    conforms(ProblemDetailsSchema, res.body);
    expect(res.body).toMatchObject({ status, code });
  }

  it('400 VALIDATION_FAILED (con errors[]), 404, 409 y 422', async () => {
    expectProblem(await send({ type: 'LIMIT', quantity: 1 }), 400, 'VALIDATION_FAILED');
    expectProblem(await request(app).get('/v1/users/999/portfolio'), 404, 'NOT_FOUND');
    expectProblem(
      await request(app).post('/v1/orders/2/cancellation').send({ userId: 1 }),
      409,
      'ORDER_NOT_CANCELLABLE',
    );
    expectProblem(await send({ type: 'MARKET', amount: '100' }), 422, 'ZERO_QUANTITY');
  });

  it('429 RATE_LIMITED', async () => {
    const limited = (await buildTestApp({ rateLimitMax: 1 })).app;
    await request(limited).get('/v1/instruments?q=pam');
    expectProblem(await request(limited).get('/v1/instruments?q=pam'), 429, 'RATE_LIMITED');
  });
});
