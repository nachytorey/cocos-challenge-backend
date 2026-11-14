import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp, createLifecycle } from '../src/app';
import { createDataSource } from '../src/data-source';
import { createLogger } from '../src/shared/logger';
import { closeTestDataSource, testConfig } from './helpers/db';

const owned: DataSource[] = [];

/** App con su propio DataSource, para poder romperlo sin afectar al resto de los tests. */
async function buildApp() {
  const config = testConfig();
  const dataSource = createDataSource(config);
  await dataSource.initialize();
  owned.push(dataSource);
  const app = createApp({
    config,
    dataSource,
    logger: createLogger({ level: 'silent' }),
    lifecycle: createLifecycle(),
  });
  return { app, dataSource };
}

afterAll(async () => {
  for (const ds of owned) if (ds.isInitialized) await ds.destroy();
  await closeTestDataSource();
});

describe('readiness con la base de datos caída (Constitution XIV)', () => {
  it('con la base viva: live y ready responden 200', async () => {
    const { app } = await buildApp();
    await request(app).get('/health/live').expect(200);
    const ready = await request(app).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ok' });
  });

  it('con la conexión cerrada: ready responde 503 unavailable y live sigue en 200', async () => {
    const { app, dataSource } = await buildApp();
    await dataSource.destroy();

    const ready = await request(app).get('/health/ready');
    const live = await request(app).get('/health/live');

    expect(ready.status).toBe(503);
    expect(ready.body).toEqual({ status: 'unavailable' });
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ status: 'ok' });
  });

  it('con la conexión abierta pero la base fallando en SELECT 1: ready responde 503', async () => {
    const { app, dataSource } = await buildApp();
    const query = jest.spyOn(dataSource, 'query').mockRejectedValue(new Error('connection lost'));

    const ready = await request(app).get('/health/ready');

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(ready.status).toBe(503);
    expect(ready.body).toEqual({ status: 'unavailable' });
    query.mockRestore();
    const recovered = await request(app).get('/health/ready');
    expect(recovered.status).toBe(200);
  });
});
