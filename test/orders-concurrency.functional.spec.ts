import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, loadChallengeSeed, resetDb } from './helpers/db';
import {
  cashIn,
  createInstrument,
  createMarketData,
  createOrder,
  createUser,
} from './helpers/factories';
import { holdingsOf } from './helpers/holdings';
import { buildTestApp } from './helpers/test-app';

let app: Express;
let ds: DataSource;
let instrumentId: number;

beforeEach(async () => {
  ({ app, dataSource: ds } = await buildTestApp({ ordersRateLimitMax: 1000 }));
  await resetDb(ds);
  await loadChallengeSeed(ds);
  instrumentId = await createInstrument(ds, { ticker: 'CONC', name: 'Concurrency Test' });
  await createMarketData(ds, { instrumentId, close: '100.00', previousClose: '100.00' });
});
afterAll(closeTestDataSource);

function fire(userId: number, side: 'BUY' | 'SELL', n: number) {
  return Promise.all(
    Array.from({ length: n }, (_, i) =>
      request(app)
        .post('/v1/orders')
        .set('Idempotency-Key', `conc-${side}-${userId}-${i}`)
        .send({ userId, instrumentId, side, type: 'MARKET', quantity: 1, currency: 'ARS' }),
    ),
  );
}

const statuses = (responses: request.Response[]) =>
  responses.map((r) => (r.body as { status: string }).status);

describe('concurrencia de órdenes del mismo usuario (SC-002)', () => {
  it('20 compras simultáneas con saldo para 10: exactamente 10 FILLED y saldo nunca negativo', async () => {
    const userId = await createUser(ds);
    await cashIn(ds, userId, 1000);

    const responses = await fire(userId, 'BUY', 20);

    expect(responses.every((r) => r.status === 201)).toBe(true);
    const s = statuses(responses);
    expect(s.filter((x) => x === 'FILLED')).toHaveLength(10);
    expect(s.filter((x) => x === 'REJECTED')).toHaveLength(10);
    expect((await holdingsOf(ds, userId)).availableCash.toFixed(2)).toBe('0.00');
  });

  it('20 ventas simultáneas sobre 10 acciones: exactamente 10 FILLED', async () => {
    const userId = await createUser(ds);
    await cashIn(ds, userId, 1000);
    await createOrder(ds, {
      userId,
      instrumentId,
      side: 'BUY',
      status: 'FILLED',
      size: 10,
      price: '100',
    });

    const responses = await fire(userId, 'SELL', 20);

    const s = statuses(responses);
    expect(s.filter((x) => x === 'FILLED')).toHaveLength(10);
    expect(s.filter((x) => x === 'REJECTED')).toHaveLength(10);
    expect((await holdingsOf(ds, userId)).positions.get(instrumentId)?.quantity).toBe(0);
  });
});
