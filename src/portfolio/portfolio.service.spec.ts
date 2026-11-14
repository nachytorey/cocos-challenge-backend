import type { EntityManager } from 'typeorm';
import type { HoldingOrder } from '../holdings/compute-holdings';
import type { LatestPrice } from '../market-data/market-data.repository';
import { NotFoundError } from '../shared/errors';
import { PortfolioService, type PortfolioServiceDeps } from './portfolio.service';

interface Fixture {
  exists?: boolean;
  orders?: HoldingOrder[];
  prices?: Record<number, LatestPrice>;
  instruments?: { id: number; ticker: string; name: string }[];
}

function build(f: Fixture = {}) {
  const deps: PortfolioServiceDeps = {
    manager: {} as EntityManager,
    users: { exists: jest.fn().mockResolvedValue(f.exists ?? true) },
    holdings: { findHoldingOrders: jest.fn().mockResolvedValue(f.orders ?? []) },
    marketData: {
      findLatestByInstrumentIds: jest
        .fn()
        .mockResolvedValue(new Map(Object.entries(f.prices ?? {}).map(([k, v]) => [Number(k), v]))),
    },
    instruments: {
      findByIds: jest
        .fn()
        .mockResolvedValue((f.instruments ?? []).map((i) => ({ ...i, type: 'ACCIONES' }))),
    },
  };
  return new PortfolioService(deps);
}

const cashIn = (size: number): HoldingOrder => ({
  instrumentId: 66,
  side: 'CASH_IN',
  status: 'FILLED',
  size,
  price: '1',
});
const buy = (instrumentId: number, size: number, price: string): HoldingOrder => ({
  instrumentId,
  side: 'BUY',
  status: 'FILLED',
  size,
  price,
});

describe('PortfolioService.getPortfolio', () => {
  it('usuario inexistente → NotFoundError', async () => {
    await expect(build({ exists: false }).getPortfolio(9)).rejects.toThrow(NotFoundError);
  });

  it('calcula valor de mercado, rendimiento total y retorno diario', async () => {
    const portfolio = await build({
      orders: [cashIn(10000), buy(1, 10, '100')],
      prices: { 1: { close: '110.00', previousClose: '100.00' } },
      instruments: [{ id: 1, ticker: 'AAA', name: 'Alpha' }],
    }).getPortfolio(1);

    expect(portfolio).toEqual({
      userId: 1,
      availableCash: { amount: '9000.00', currency: 'ARS' },
      reservedCash: { amount: '0.00', currency: 'ARS' },
      totalAccountValue: { amount: '10100.00', currency: 'ARS' },
      positions: [
        {
          instrumentId: 1,
          ticker: 'AAA',
          name: 'Alpha',
          quantity: 10,
          averageCost: { amount: '100.00', currency: 'ARS' },
          lastPrice: { amount: '110.00', currency: 'ARS' },
          marketValue: { amount: '1100.00', currency: 'ARS' },
          totalReturnPct: '10.00',
          dailyReturnPct: '10.00',
        },
      ],
    });
  });

  it('lista solo posiciones con cantidad positiva, ordenadas por ticker', async () => {
    const portfolio = await build({
      orders: [
        cashIn(10000),
        buy(1, 1, '10'),
        buy(2, 1, '10'),
        buy(3, 1, '10'),
        { instrumentId: 3, side: 'SELL', status: 'FILLED', size: 1, price: '10' },
      ],
      prices: {
        1: { close: '10', previousClose: '10' },
        2: { close: '10', previousClose: '10' },
      },
      instruments: [
        { id: 1, ticker: 'ZZZ', name: 'Z' },
        { id: 2, ticker: 'BBB', name: 'B' },
      ],
    }).getPortfolio(1);
    expect(portfolio.positions.map((p) => p.ticker)).toEqual(['BBB', 'ZZZ']);
  });

  it('sin precio: marketValue, lastPrice y rendimientos en null, y no suma al total', async () => {
    const portfolio = await build({
      orders: [cashIn(1000), buy(1, 5, '100')],
      prices: {},
      instruments: [{ id: 1, ticker: 'NOP', name: 'Sin precio' }],
    }).getPortfolio(1);
    expect(portfolio.positions[0]).toMatchObject({
      lastPrice: null,
      marketValue: null,
      totalReturnPct: null,
      dailyReturnPct: null,
    });
    expect(portfolio.totalAccountValue.amount).toBe('500.00');
  });

  it('previousClose en 0 o ausente → dailyReturnPct null', async () => {
    const portfolio = await build({
      orders: [cashIn(1000), buy(1, 1, '10'), buy(2, 1, '10')],
      prices: {
        1: { close: '12', previousClose: '0' },
        2: { close: '12', previousClose: null },
      },
      instruments: [
        { id: 1, ticker: 'AAA', name: 'A' },
        { id: 2, ticker: 'BBB', name: 'B' },
      ],
    }).getPortfolio(1);
    expect(portfolio.positions.map((p) => p.dailyReturnPct)).toEqual([null, null]);
    expect(portfolio.positions[0].totalReturnPct).toBe('20.00');
  });

  it('las órdenes NEW reservan pesos sin cambiar el valor total', async () => {
    const portfolio = await build({
      orders: [
        cashIn(1000),
        { instrumentId: 1, side: 'BUY', status: 'NEW', size: 2, price: '100' },
      ],
    }).getPortfolio(1);
    expect(portfolio.availableCash.amount).toBe('800.00');
    expect(portfolio.reservedCash.amount).toBe('200.00');
    expect(portfolio.totalAccountValue.amount).toBe('1000.00');
    expect(portfolio.positions).toEqual([]);
  });
});
