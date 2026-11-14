import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, loadChallengeSeed, resetDb } from './helpers/db';
import { createUser } from './helpers/factories';
import { buildTestApp } from './helpers/test-app';

let app: Express;
let ds: DataSource;

beforeEach(async () => {
  ({ app, dataSource: ds } = await buildTestApp());
  await resetDb(ds);
  await loadChallengeSeed(ds);
});
afterAll(closeTestDataSource);

interface Position {
  instrumentId: number;
  quantity: number;
  marketValue: { amount: string } | null;
  totalReturnPct: string | null;
  dailyReturnPct: string | null;
}
interface PortfolioBody {
  availableCash: { amount: string };
  reservedCash: { amount: string };
  totalAccountValue: { amount: string };
  positions: Position[];
}

const getPortfolio = async (userId: number | string) => {
  const res = await request(app).get(`/v1/users/${userId}/portfolio`);
  return { res, body: res.body as PortfolioBody };
};

const order = (body: object, key: string) =>
  request(app)
    .post('/v1/orders')
    .set('Idempotency-Key', key)
    .send({ userId: 1, instrumentId: 47, currency: 'ARS', side: 'BUY', ...body });

describe('GET /v1/users/:userId/portfolio', () => {
  it('portfolio del usuario 1 coincide al centavo con el cálculo manual (SC-004)', async () => {
    const { res, body } = await getPortfolio(1);
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      userId: 1,
      availableCash: { amount: '627500.00', currency: 'ARS' },
      reservedCash: { amount: '125500.00', currency: 'ARS' },
      totalAccountValue: { amount: '904784.00', currency: 'ARS' },
    });
    const byId = new Map(body.positions.map((p) => [p.instrumentId, p]));
    expect(byId.get(47)).toMatchObject({
      quantity: 40,
      marketValue: { amount: '37034.00' },
      totalReturnPct: '-0.45',
      dailyReturnPct: '0.44',
    });
    expect(byId.get(54)).toMatchObject({
      quantity: 500,
      marketValue: { amount: '114750.00' },
      totalReturnPct: '-8.20',
      dailyReturnPct: '-1.08',
    });
    expect(byId.has(31)).toBe(false);
    expect(body.positions).toHaveLength(2);
  });

  it('usuario sin órdenes → todo en 0.00 y sin posiciones', async () => {
    const userId = await createUser(ds);
    const { res, body } = await getPortfolio(userId);
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      availableCash: { amount: '0.00' },
      reservedCash: { amount: '0.00' },
      totalAccountValue: { amount: '0.00' },
      positions: [],
    });
  });

  it('usuario inexistente → 404; userId inválido → 400', async () => {
    const missing = await getPortfolio(999);
    const invalid = await getPortfolio('abc');
    expect(missing.res.status).toBe(404);
    expect(missing.res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(invalid.res.status).toBe(400);
    expect(invalid.res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('tras una compra MARKET el portfolio refleja la nueva cantidad (FR-012)', async () => {
    const created = await order({ type: 'MARKET', quantity: 10 }, 'portfolio-key-1');
    expect(created.status).toBe(201);
    const { body } = await getPortfolio(1);
    expect(body.positions.find((p) => p.instrumentId === 47)?.quantity).toBe(50);
    expect(body.availableCash.amount).toBe('618241.50');
  });

  it('tras una LIMIT NEW sube reservedCash y el valor total no cambia', async () => {
    const before = (await getPortfolio(1)).body;
    const created = await order({ type: 'LIMIT', quantity: 5, price: '900' }, 'portfolio-key-2');
    expect(created.status).toBe(201);
    const { body } = await getPortfolio(1);
    expect(body.reservedCash.amount).toBe('130000.00');
    expect(body.availableCash.amount).toBe('623000.00');
    expect(body.totalAccountValue.amount).toBe(before.totalAccountValue.amount);
  });
});
