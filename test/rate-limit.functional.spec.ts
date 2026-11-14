import request from 'supertest';
import { closeTestDataSource } from './helpers/db';
import { buildTestApp } from './helpers/test-app';

afterAll(closeTestDataSource);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const search = (app: Parameters<typeof request>[0]) => request(app).get('/v1/instruments?q=pam');

describe('rate limit global (principio XII)', () => {
  it('superar el límite devuelve 429 RATE_LIMITED en Problem Details con Retry-After entero', async () => {
    const { app } = await buildTestApp({ rateLimitMax: 3, rateLimitWindowMs: 60_000 });

    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await search(app)).status);
    const limited = await search(app);

    expect(statuses).toEqual([200, 200, 200]);
    expect(limited.status).toBe(429);
    expect(limited.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(limited.body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('pasada la ventana vuelve a responder', async () => {
    const { app } = await buildTestApp({ rateLimitMax: 1, rateLimitWindowMs: 1000 });
    const first = await search(app);
    const second = await search(app);
    await sleep(1100);
    const third = await search(app);
    expect([first.status, second.status, third.status]).toEqual([200, 429, 200]);
  });

  it('Retry-After es el tiempo restante de la ventana y decrece', async () => {
    const { app } = await buildTestApp({ rateLimitMax: 1, rateLimitWindowMs: 6000 });
    await search(app);
    const early = Number((await search(app)).headers['retry-after']);
    await sleep(2200);
    const later = Number((await search(app)).headers['retry-after']);
    expect(early).toBeGreaterThanOrEqual(5);
    expect(early).toBeLessThanOrEqual(6);
    expect(later).toBeLessThan(early);
    expect(later).toBeLessThanOrEqual(4);
  });
});

describe('límite más estricto en las operaciones de órdenes', () => {
  const post = (app: Parameters<typeof request>[0], path: string) =>
    request(app).post(path).send({});

  it('POST /v1/orders se limita antes que el límite global', async () => {
    const { app } = await buildTestApp({ rateLimitMax: 100, ordersRateLimitMax: 2 });
    const a = await post(app, '/v1/orders');
    const b = await post(app, '/v1/orders');
    const c = await post(app, '/v1/orders');
    const readsStillWork = await search(app);
    // El limiter corre antes que la validación: los dos primeros llegan a validar (400).
    expect([a.status, b.status, c.status]).toEqual([400, 400, 429]);
    expect(c.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(readsStillWork.status).toBe(200);
  });

  it('las cancelaciones comparten el límite de las órdenes', async () => {
    const { app } = await buildTestApp({ rateLimitMax: 100, ordersRateLimitMax: 2 });
    const order = await post(app, '/v1/orders');
    const cancel = await post(app, '/v1/orders/5/cancellation');
    const next = await post(app, '/v1/orders/5/cancellation');
    expect([order.status, cancel.status, next.status]).toEqual([400, 400, 429]);
  });

  it('el límite global también aplica a las rutas de órdenes', async () => {
    const { app } = await buildTestApp({ rateLimitMax: 2, ordersRateLimitMax: 100 });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await post(app, '/v1/orders')).status);
    expect(statuses).toEqual([400, 400, 429]);
  });
});
