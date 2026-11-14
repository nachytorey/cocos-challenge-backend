import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, loadChallengeSeed, resetDb } from './helpers/db';
import { buildTestApp } from './helpers/test-app';

let app: Express;
let ds: DataSource;

beforeAll(async () => {
  ({ app, dataSource: ds } = await buildTestApp());
  await resetDb(ds);
  await loadChallengeSeed(ds);
});
afterAll(closeTestDataSource);

interface Item {
  id: number;
  ticker: string;
  name: string;
  type: string;
  lastPrice: { amount: string; currency: string } | null;
}
interface Page {
  data: Item[];
  page: { nextCursor: string | null; hasMore: boolean };
}

async function search(query: Record<string, string | number>) {
  const res = await request(app).get('/v1/instruments').query(query);
  return { res, body: res.body as Page };
}

describe('GET /v1/instruments', () => {
  it('busca por ticker sin distinguir mayúsculas', async () => {
    const { res, body } = await search({ q: 'pam' });
    expect(res.status).toBe(200);
    expect(body.data.map((i) => i.ticker)).toContain('PAMP');
  });

  it('busca por nombre sin distinguir mayúsculas', async () => {
    const { body } = await search({ q: 'PAMPA' });
    expect(body.data.map((i) => i.name)).toContain('Pampa Holding S.A.');
  });

  it('excluye el instrumento MONEDA', async () => {
    const { body } = await search({ q: 'ars' });
    expect(body.data.every((i) => i.type !== 'MONEDA')).toBe(true);
    expect(body.data.map((i) => i.ticker)).not.toContain('ARS');
  });

  it('sin coincidencias → lista vacía', async () => {
    const { res, body } = await search({ q: 'zzzz' });
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: [], page: { nextCursor: null, hasMore: false } });
  });

  it('q vacío o limit fuera de rango → 400', async () => {
    const empty = await search({ q: '' });
    const tooMany = await search({ q: 'a', limit: 101 });
    expect(empty.res.status).toBe(400);
    expect(tooMany.res.status).toBe(400);
    expect(tooMany.res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('cursor inválido → 400', async () => {
    const { res } = await search({ q: 'a', cursor: 'basura' });
    expect(res.status).toBe(400);
  });

  it('pagina por cursor sin repetir ni perder resultados', async () => {
    const all = await search({ q: 's', limit: 100 });
    const firstPage = await search({ q: 's', limit: 5 });
    expect(firstPage.body.data).toHaveLength(5);
    expect(firstPage.body.page.hasMore).toBe(true);

    const seen: number[] = firstPage.body.data.map((i) => i.id);
    let cursor = firstPage.body.page.nextCursor;
    while (cursor) {
      const { body } = await search({ q: 's', limit: 5, cursor });
      seen.push(...body.data.map((i) => i.id));
      cursor = body.page.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(all.body.data.map((i) => i.id));
  });

  it('los comodines del usuario se escapan (q=% no devuelve todo el catálogo)', async () => {
    const { body } = await search({ q: '%' });
    expect(body.data).toEqual([]);
  });

  it('cada resultado trae ticker, name, type y lastPrice (null si no hay precio)', async () => {
    const { body } = await search({ q: 'a', limit: 100 });
    const money = { amount: expect.any(String) as string, currency: 'ARS' };
    const shape = {
      id: expect.any(Number) as number,
      ticker: expect.any(String) as string,
      name: expect.any(String) as string,
      type: 'ACCIONES',
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.map(({ lastPrice: _p, ...rest }) => rest)).toEqual(body.data.map(() => shape));
    expect(body.data.every((i) => i.lastPrice === null || i.lastPrice.currency === 'ARS')).toBe(
      true,
    );
    const pamp = (await search({ q: 'PAMP' })).body.data.find((i) => i.ticker === 'PAMP');
    expect(pamp?.lastPrice).toEqual(money);
  });

  it('un instrumento sin precio devuelve lastPrice null', async () => {
    const rows: { ticker: string }[] = await ds.query(
      `SELECT i.ticker FROM instruments i WHERE i.type = 'ACCIONES'
         AND NOT EXISTS (SELECT 1 FROM marketdata m WHERE m.instrumentid = i.id) LIMIT 1`,
    );
    const { body } = await search({ q: rows[0].ticker });
    expect(body.data.find((i) => i.ticker === rows[0].ticker)?.lastPrice).toBeNull();
  });
});
