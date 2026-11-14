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

beforeEach(async () => {
  ({ app, dataSource: ds } = await buildTestApp());
  await resetDb(ds);
  await loadChallengeSeed(ds);
});
afterAll(closeTestDataSource);

const cancel = (orderId: number | string, userId: number) =>
  request(app).post(`/v1/orders/${orderId}/cancellation`).send({ userId });

const reservedCash = async (userId: number) =>
  (
    (await request(app).get(`/v1/users/${userId}/portfolio`)).body as {
      reservedCash: { amount: string };
    }
  ).reservedCash.amount;

describe('POST /v1/orders/:orderId/cancellation', () => {
  it('cancela la orden NEW 5 del usuario 1 y libera su reserva', async () => {
    expect(await reservedCash(1)).toBe('125500.00');
    const res = await cancel(5, 1);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 5, status: 'CANCELLED', type: 'LIMIT', quantity: 50 });
    expect(await reservedCash(1)).toBe('90000.00');
  });

  it('cancelar dos veces → 409 ORDER_NOT_CANCELLABLE', async () => {
    expect((await cancel(5, 1)).status).toBe(200);
    const again = await cancel(5, 1);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
  });

  it('una orden FILLED no se puede cancelar → 409', async () => {
    const res = await cancel(2, 1);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
  });

  it('la orden de otro usuario → 404', async () => {
    const res = await cancel(5, 2);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', detail: 'Order 5 not found' });
  });

  it('un parámetro de query desconocido → 400 y la orden no se cancela (principio III)', async () => {
    const res = await request(app)
      .post('/v1/orders/5/cancellation')
      .query({ x: 1 })
      .send({ userId: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await reservedCash(1)).toBe('125500.00');
  });

  it('orderId inválido o body sin userId → 400', async () => {
    const badId = await cancel('abc', 1);
    const noUser = await request(app).post('/v1/orders/5/cancellation').send({});
    expect(badId.status).toBe(400);
    expect(noUser.status).toBe(400);
  });

  it('5 cancelaciones simultáneas de la misma orden: un 200 y cuatro 409, y la reserva se libera una sola vez', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => cancel(5, 1)));

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
    const conflicts = responses.filter((r) => r.status === 409);
    expect(
      conflicts.every((r) => (r.body as { code: string }).code === 'ORDER_NOT_CANCELLABLE'),
    ).toBe(true);
    // La orden 5 reservaba 35.500: 125.500 → 90.000, una sola vez.
    expect(await reservedCash(1)).toBe('90000.00');
  });

  it('cancelación y compra simultáneas del mismo usuario no dejan saldo negativo', async () => {
    const userId = await createUser(ds);
    const instrumentId = await createInstrument(ds, { ticker: 'CNCL' });
    await createMarketData(ds, { instrumentId, close: '100.00', previousClose: '100.00' });
    await cashIn(ds, userId, 1000);
    const pendingId = await createOrder(ds, {
      userId,
      instrumentId,
      side: 'BUY',
      status: 'NEW',
      type: 'LIMIT',
      size: 10,
      price: '100',
    });

    const [cancelled, bought] = await Promise.all([
      cancel(pendingId, userId),
      request(app)
        .post('/v1/orders')
        .set('Idempotency-Key', 'cancel-race-1')
        .send({ userId, instrumentId, side: 'BUY', type: 'MARKET', quantity: 10, currency: 'ARS' }),
    ]);

    expect(cancelled.status).toBe(200);
    expect(bought.status).toBe(201);
    const available = (await holdingsOf(ds, userId)).availableCash;
    expect(available.isNegative()).toBe(false);
  });
});
