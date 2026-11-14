import request from 'supertest';
import { closeTestDataSource } from './helpers/db';
import { buildTestApp } from './helpers/test-app';

afterAll(closeTestDataSource);

describe('infraestructura HTTP', () => {
  it('health live y ready responden 200', async () => {
    const { app } = await buildTestApp();
    await request(app).get('/health/live').expect(200);
    await request(app).get('/health/ready').expect(200);
  });

  it('una ruta inexistente devuelve 404 en Problem Details', async () => {
    const { app } = await buildTestApp();
    const res = await request(app).get('/v1/no-existe').expect(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('/docs-json devuelve un OpenAPI 3.1', async () => {
    const { app } = await buildTestApp();
    const res = await request(app).get('/docs-json').expect(200);
    expect((res.body as { openapi: string }).openapi).toMatch(/^3\.1/);
  });

  it('POST con Origin no permitido → 403 ORIGIN_NOT_ALLOWED', async () => {
    const { app } = await buildTestApp({ corsOrigins: ['https://app.example.com'] });
    const res = await request(app)
      .post('/v1/cualquier-ruta')
      .set('Origin', 'https://evil.com')
      .send({})
      .expect(403);
    expect(res.body).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
  });

  it('body mayor al límite → 413 PAYLOAD_TOO_LARGE', async () => {
    const { app } = await buildTestApp({ bodyLimit: '1kb' });
    const res = await request(app)
      .post('/v1/cualquier-ruta')
      .send({ data: 'x'.repeat(5000) })
      .expect(413);
    expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('en producción rechaza HTTP sin TLS y envía HSTS', async () => {
    const { app } = await buildTestApp({ nodeEnv: 'production', trustProxy: 1 });
    const res = await request(app).get('/health/live').set('X-Forwarded-Proto', 'http').expect(403);
    expect(res.body).toMatchObject({ code: 'HTTPS_REQUIRED' });
    expect(res.headers['strict-transport-security']).toBeDefined();
    await request(app).get('/health/live').set('X-Forwarded-Proto', 'https').expect(200);
  });
});
