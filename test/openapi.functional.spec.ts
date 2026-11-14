import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { parse } from 'yaml';
import { closeTestDataSource } from './helpers/db';
import { buildTestApp } from './helpers/test-app';

afterAll(closeTestDataSource);

interface OpenApiDoc {
  openapi: string;
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
}

/** Mapa "METODO /ruta" → códigos de respuesta ordenados, para comparar dos documentos. */
function operations(doc: OpenApiDoc): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      result[`${method.toUpperCase()} ${path}`] = Object.keys(operation.responses).sort();
    }
  }
  return result;
}

describe('contrato OpenAPI (contracts/openapi.yaml)', () => {
  it('el documento generado desde zod tiene los mismos paths, métodos y códigos de respuesta', async () => {
    const reference = parse(
      readFileSync(
        join(__dirname, '..', 'specs', '001-portfolio-orders-api', 'contracts', 'openapi.yaml'),
        'utf8',
      ),
    ) as OpenApiDoc;
    const { app } = await buildTestApp();
    const generated = (await request(app).get('/docs-json').expect(200)).body as OpenApiDoc;

    expect(generated.openapi).toBe(reference.openapi);
    expect(operations(generated)).toEqual(operations(reference));
  });

  it('todo endpoint documenta los errores comunes (403, 429, 500 y 503)', async () => {
    const { app } = await buildTestApp();
    const generated = (await request(app).get('/docs-json').expect(200)).body as OpenApiDoc;
    const missing = Object.entries(operations(generated)).filter(
      ([, codes]) => !['403', '429', '500', '503'].every((c) => codes.includes(c)),
    );
    expect(missing).toEqual([]);
  });

  it('los endpoints que cambian estado documentan 413', async () => {
    const { app } = await buildTestApp();
    const generated = (await request(app).get('/docs-json').expect(200)).body as OpenApiDoc;
    const posts = Object.entries(operations(generated)).filter(([op]) => op.startsWith('POST '));
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.filter(([, codes]) => !codes.includes('413'))).toEqual([]);
  });
});
