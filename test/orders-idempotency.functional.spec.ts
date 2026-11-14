import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, loadChallengeSeed, resetDb } from './helpers/db';
import { cashIn, createUser } from './helpers/factories';
import { countOrders } from './helpers/holdings';
import { buildTestApp } from './helpers/test-app';

let app: Express;
let ds: DataSource;

beforeEach(async () => {
  ({ app, dataSource: ds } = await buildTestApp());
  await resetDb(ds);
  await loadChallengeSeed(ds);
});
afterAll(closeTestDataSource);

const order = {
  userId: 1,
  instrumentId: 47,
  side: 'BUY',
  type: 'MARKET',
  quantity: 1,
  currency: 'ARS',
};

const post = (key: string, body: object) =>
  request(app).post('/v1/orders').set('Idempotency-Key', key).send(body);

describe('idempotencia de POST /v1/orders', () => {
  it('el mismo envío repetido crea una sola orden y devuelve la original', async () => {
    const before = await countOrders(ds, 1);
    const first = await post('idem-key-0001', order).expect(201);
    const second = await post('idem-key-0001', order).expect(200);
    const third = await post('idem-key-0001', { ...order }).expect(200);
    expect(second.body).toEqual(first.body);
    expect(third.body).toEqual(first.body);
    expect(await countOrders(ds, 1)).toBe(before + 1);
  });

  it('el orden de las claves del body no cambia el resultado', async () => {
    const first = await post('idem-key-0002', order);
    const reordered = {
      currency: 'ARS',
      quantity: 1,
      type: 'MARKET',
      side: 'BUY',
      instrumentId: 47,
      userId: 1,
    };
    const replay = await post('idem-key-0002', reordered);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
  });

  it('la misma clave con otro body → 422 IDEMPOTENCY_KEY_REUSED', async () => {
    await post('idem-key-0003', order).expect(201);
    const res = await post('idem-key-0003', { ...order, quantity: 2 }).expect(422);
    expect(res.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('la misma clave en otro usuario crea otra orden', async () => {
    const other = await createUser(ds);
    await cashIn(ds, other, 100000);
    const a = await post('idem-key-0004', order).expect(201);
    const b = await post('idem-key-0004', { ...order, userId: other }).expect(201);
    expect((b.body as { id: number }).id).not.toBe((a.body as { id: number }).id);
  });

  it('una request inválida no consume la clave', async () => {
    const invalid = await post('idem-key-0005', { ...order, quantity: -1 });
    const valid = await post('idem-key-0005', order);
    expect(invalid.status).toBe(400);
    expect(valid.status).toBe(201);
    expect(valid.body).toMatchObject({ status: 'FILLED', quantity: 1 });
  });
});
