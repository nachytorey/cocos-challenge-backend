import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, loadChallengeSeed, resetDb } from './helpers/db';
import { countOrders, holdingsOf } from './helpers/holdings';
import { buildTestApp } from './helpers/test-app';

let app: Express;
let ds: DataSource;
let keySeq = 0;

beforeEach(async () => {
  ({ app, dataSource: ds } = await buildTestApp());
  await resetDb(ds);
  await loadChallengeSeed(ds);
});
afterAll(closeTestDataSource);

const base = { userId: 1, instrumentId: 47, currency: 'ARS' };

function send(body: object) {
  return request(app)
    .post('/v1/orders')
    .set('Idempotency-Key', `orders-test-${++keySeq}`)
    .send(body);
}

describe('POST /v1/orders (test funcional del enunciado)', () => {
  it('MARKET BUY por cantidad queda FILLED al último cierre', async () => {
    const res = await send({ ...base, side: 'BUY', type: 'MARKET', quantity: 10 }).expect(201);
    expect(res.body).toMatchObject({
      userId: 1,
      instrumentId: 47,
      side: 'BUY',
      type: 'MARKET',
      status: 'FILLED',
      quantity: 10,
      price: { amount: '925.85', currency: 'ARS' },
    });
    expect(res.headers.location).toBe(`/v1/orders/${(res.body as { id: number }).id}`);
    expect((await holdingsOf(ds, 1)).positions.get(47)?.quantity).toBe(50);
    expect((await holdingsOf(ds, 1)).availableCash.toFixed(2)).toBe('618241.50');
  });

  it('LIMIT BUY por monto queda NEW con la cantidad calculada', async () => {
    const res = await send({
      ...base,
      side: 'BUY',
      type: 'LIMIT',
      amount: '5000',
      price: '900',
    }).expect(201);
    expect(res.body).toMatchObject({ status: 'NEW', quantity: 5, price: { amount: '900.00' } });
    expect((await holdingsOf(ds, 1)).reservedCash.toFixed(2)).toBe('130000.00');
  });

  it('compra por encima de los pesos disponibles → REJECTED y el saldo no cambia', async () => {
    const before = (await holdingsOf(ds, 1)).availableCash.toFixed(2);
    const res = await send({ ...base, side: 'BUY', type: 'MARKET', quantity: 10000 }).expect(201);
    expect(res.body).toMatchObject({ status: 'REJECTED', quantity: 10000 });
    expect((await holdingsOf(ds, 1)).availableCash.toFixed(2)).toBe(before);
  });

  it('venta dentro de la tenencia → FILLED; por encima → REJECTED', async () => {
    const sell = { userId: 1, instrumentId: 54, currency: 'ARS', side: 'SELL', type: 'MARKET' };
    await send({ ...sell, quantity: 100 })
      .expect(201)
      .expect((r) => expect((r.body as { status: string }).status).toBe('FILLED'));
    const res = await send({ ...sell, quantity: 1000 }).expect(201);
    expect(res.body).toMatchObject({ status: 'REJECTED' });
    expect((await holdingsOf(ds, 1)).positions.get(54)?.quantity).toBe(400);
  });

  it.each([
    ['LIMIT sin price', { side: 'BUY', type: 'LIMIT', quantity: 1 }],
    ['MARKET con price', { side: 'BUY', type: 'MARKET', quantity: 1, price: '10' }],
    ['quantity y amount juntos', { side: 'BUY', type: 'MARKET', quantity: 1, amount: '100' }],
    ['ni quantity ni amount', { side: 'BUY', type: 'MARKET' }],
    ['quantity negativa', { side: 'BUY', type: 'MARKET', quantity: -1 }],
    ['quantity con decimales', { side: 'BUY', type: 'MARKET', quantity: 1.5 }],
    ['side inválido', { side: 'CASH_IN', type: 'MARKET', quantity: 1 }],
    ['campo desconocido', { side: 'BUY', type: 'MARKET', quantity: 1, foo: 1 }],
  ])('%s → 400 sin registrar', async (_name, body) => {
    const before = await countOrders(ds, 1);
    const res = await send({ ...base, ...body }).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await countOrders(ds, 1)).toBe(before);
  });

  it.each([
    ['sin currency', { userId: 1, instrumentId: 47 }],
    ['currency USD', { userId: 1, instrumentId: 47, currency: 'USD' }],
  ])('%s → 400', async (_name, b) => {
    const res = await send({ ...b, side: 'BUY', type: 'MARKET', quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [expect.objectContaining({ field: 'currency' })],
    });
  });

  it('monto que no alcanza para una acción → 422 ZERO_QUANTITY sin registrar', async () => {
    const before = await countOrders(ds, 1);
    const res = await send({ ...base, side: 'BUY', type: 'MARKET', amount: '100' }).expect(422);
    expect(res.body).toMatchObject({ code: 'ZERO_QUANTITY' });
    expect(await countOrders(ds, 1)).toBe(before);
  });

  it('instrumento MONEDA → 400', async () => {
    const res = await send({ ...base, instrumentId: 66, side: 'BUY', type: 'MARKET', quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'instrumentId', message: 'cannot be the currency instrument' }],
    });
  });

  it('MARKET sobre un instrumento sin precio → 422 PRICE_UNAVAILABLE', async () => {
    const rows: { id: number }[] = await ds.query(
      `SELECT i.id FROM instruments i WHERE i.type = 'ACCIONES'
         AND NOT EXISTS (SELECT 1 FROM marketdata m WHERE m.instrumentid = i.id) LIMIT 1`,
    );
    const res = await send({
      ...base,
      instrumentId: rows[0].id,
      side: 'BUY',
      type: 'MARKET',
      quantity: 1,
    });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'PRICE_UNAVAILABLE' });
  });

  it('usuario o instrumento inexistente → 404', async () => {
    const order = { ...base, side: 'BUY', type: 'MARKET', quantity: 1 };
    const noUser = await send({ ...order, userId: 999 });
    const noInstrument = await send({ ...order, instrumentId: 9999 });
    expect(noUser.status).toBe(404);
    expect(noUser.body).toMatchObject({ code: 'NOT_FOUND', detail: 'User 999 not found' });
    expect(noInstrument.status).toBe(404);
    expect(noInstrument.body).toMatchObject({ detail: 'Instrument 9999 not found' });
  });

  it('sin Idempotency-Key → 400', async () => {
    await request(app)
      .post('/v1/orders')
      .send({ ...base, side: 'BUY', type: 'MARKET', quantity: 1 })
      .expect(400);
  });
});
