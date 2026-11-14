import request from 'supertest';
import type { DataSource, QueryRunner } from 'typeorm';
import { createApp, createLifecycle } from '../src/app';
import { createDataSource } from '../src/data-source';
import { createLogger } from '../src/shared/logger';
import {
  closeTestDataSource,
  getTestDataSource,
  loadChallengeSeed,
  resetDb,
  testConfig,
} from './helpers/db';
import { countOrders } from './helpers/holdings';

let shared: DataSource;
let appDataSource: DataSource;
let app: ReturnType<typeof createApp>;
let holder: QueryRunner | undefined;

beforeAll(async () => {
  shared = await getTestDataSource();
  // La app corre con su propio DataSource y un lock_timeout muy corto, para no esperar 5 s.
  const config = testConfig({ dbLockTimeoutMs: 300 });
  appDataSource = createDataSource(config);
  await appDataSource.initialize();
  app = createApp({
    config,
    dataSource: appDataSource,
    logger: createLogger({ level: 'silent' }),
    lifecycle: createLifecycle(),
  });
});

beforeEach(async () => {
  await resetDb(shared);
  await loadChallengeSeed(shared);
});

afterEach(async () => {
  if (holder) {
    await holder.rollbackTransaction().catch(() => undefined);
    await holder.release();
    holder = undefined;
  }
});

afterAll(async () => {
  await appDataSource.destroy();
  await closeTestDataSource();
});

/** Otra "sesión" retiene el lock del usuario, como lo haría un envío concurrente lento. */
async function holdUserLock(userId: number): Promise<void> {
  holder = shared.createQueryRunner();
  await holder.connect();
  await holder.startTransaction();
  await holder.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
}

const order = {
  userId: 1,
  instrumentId: 47,
  side: 'BUY',
  type: 'MARKET',
  quantity: 1,
  currency: 'ARS',
};
const send = (key: string) =>
  request(app).post('/v1/orders').set('Idempotency-Key', key).send(order);

describe('lock_timeout → 409 CONCURRENT_REQUEST (research R4)', () => {
  it('con el usuario bloqueado por otra sesión, el envío responde 409 y no registra nada', async () => {
    const before = await countOrders(shared, 1);
    await holdUserLock(1);

    const res = await send('lock-timeout-1');

    expect(res.status).toBe(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 409, code: 'CONCURRENT_REQUEST' });
    expect(await countOrders(shared, 1)).toBe(before);
  });

  it('liberado el lock, el mismo envío con la misma Idempotency-Key funciona (201)', async () => {
    await holdUserLock(1);
    const blocked = await send('lock-timeout-2');
    expect(blocked.status).toBe(409);

    await holder?.rollbackTransaction();
    await holder?.release();
    holder = undefined;

    const retried = await send('lock-timeout-2');
    expect(retried.status).toBe(201);
    expect(retried.body).toMatchObject({ status: 'FILLED', quantity: 1 });
  });

  it('la cancelación también responde 409 si el usuario está bloqueado', async () => {
    await holdUserLock(1);
    const res = await request(app).post('/v1/orders/5/cancellation').send({ userId: 1 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CONCURRENT_REQUEST' });
  });

  it('el bloqueo de un usuario no afecta a otro', async () => {
    await holdUserLock(1);
    const other = await request(app)
      .post('/v1/orders')
      .set('Idempotency-Key', 'lock-timeout-other')
      .send({ ...order, userId: 2 });
    // El usuario 2 no tiene pesos: se registra REJECTED, pero no espera el lock del usuario 1.
    expect(other.status).toBe(201);
    expect(other.body).toMatchObject({ userId: 2, status: 'REJECTED' });
  });
});
