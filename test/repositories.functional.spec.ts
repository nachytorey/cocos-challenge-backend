import type { DataSource } from 'typeorm';
import { HoldingsRepository } from '../src/holdings/holdings.repository';
import { MarketDataRepository } from '../src/market-data/market-data.repository';
import { UsersRepository } from '../src/users/users.repository';
import { closeTestDataSource, getTestDataSource, loadChallengeSeed, resetDb } from './helpers/db';

let ds: DataSource;

beforeAll(async () => {
  ds = await getTestDataSource();
  await resetDb(ds);
  await loadChallengeSeed(ds);
});
afterAll(closeTestDataSource);

describe('MarketDataRepository.findLatestByInstrumentIds', () => {
  it('devuelve el cierre de la fecha más reciente', async () => {
    const prices = await new MarketDataRepository(ds).findLatestByInstrumentIds([47]);
    expect(prices.get(47)).toEqual({ close: '925.85', previousClose: '921.80' });
  });

  it('un instrumento sin precio no aparece en el resultado', async () => {
    const prices = await new MarketDataRepository(ds).findLatestByInstrumentIds([66, 47]);
    expect(prices.has(66)).toBe(false);
    expect(prices.size).toBe(1);
  });

  it('con una lista vacía no consulta y devuelve un mapa vacío', async () => {
    const prices = await new MarketDataRepository(ds).findLatestByInstrumentIds([]);
    expect(prices.size).toBe(0);
  });
});

describe('HoldingsRepository.findHoldingOrders', () => {
  it('devuelve las órdenes FILLED y NEW del usuario 1 en orden cronológico', async () => {
    const orders = await new HoldingsRepository().findHoldingOrders(ds.manager, 1);
    expect(orders).toHaveLength(9);
    expect(orders.every((o) => o.status === 'FILLED' || o.status === 'NEW')).toBe(true);
    expect(orders[0]).toMatchObject({ side: 'CASH_IN', size: 1000000, instrumentId: 66 });
    expect(orders[orders.length - 1]).toMatchObject({ side: 'SELL', instrumentId: 31 });
  });
});

describe('UsersRepository', () => {
  it('lockForUpdate devuelve true para un usuario existente y false para uno inexistente', async () => {
    const users = new UsersRepository(ds);
    await ds.transaction(async (manager) => {
      expect(await users.lockForUpdate(manager, 1)).toBe(true);
      expect(await users.lockForUpdate(manager, 999)).toBe(false);
    });
  });

  it('exists distingue usuarios existentes de inexistentes', async () => {
    const users = new UsersRepository(ds);
    expect(await users.exists(1)).toBe(true);
    expect(await users.exists(999)).toBe(false);
  });
});
