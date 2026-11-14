import type { EntityManager } from 'typeorm';
import { computeHoldings, type PositionHolding } from '../holdings/compute-holdings';
import type { HoldingsRepository } from '../holdings/holdings.repository';
import type { Instrument } from '../instruments/instrument.entity';
import type { InstrumentsRepository } from '../instruments/instruments.repository';
import type { LatestPrice, MarketDataRepository } from '../market-data/market-data.repository';
import { NotFoundError } from '../shared/errors';
import { formatMoney, formatPct, toDecimal, type Decimal } from '../shared/money';
import type { UsersRepository } from '../users/users.repository';
import type { PortfolioBody, PositionBody } from './portfolio.schemas';

export interface PortfolioServiceDeps {
  manager: EntityManager;
  users: Pick<UsersRepository, 'exists'>;
  holdings: Pick<HoldingsRepository, 'findHoldingOrders'>;
  marketData: Pick<MarketDataRepository, 'findLatestByInstrumentIds'>;
  instruments: Pick<InstrumentsRepository, 'findByIds'>;
}

/** (a − b) / b × 100, o null si b falta o es 0. */
function pctChange(current: Decimal, base: Decimal | null): Decimal | null {
  if (base === null || base.isZero()) return null;
  return current.minus(base).dividedBy(base).times(100);
}

interface Valued {
  body: PositionBody;
  marketValue: Decimal | null;
}

function valuePosition(
  instrument: Instrument,
  holding: PositionHolding,
  price: LatestPrice | undefined,
): Valued {
  const close = price ? toDecimal(price.close) : null;
  const previousClose = price?.previousClose ? toDecimal(price.previousClose) : null;
  const marketValue = close ? close.times(holding.quantity) : null;
  return {
    marketValue,
    body: {
      instrumentId: instrument.id,
      ticker: instrument.ticker,
      name: instrument.name,
      quantity: holding.quantity,
      averageCost: formatMoney(holding.averageCost),
      lastPrice: close ? formatMoney(close) : null,
      marketValue: marketValue ? formatMoney(marketValue) : null,
      totalReturnPct: formatPct(close ? pctChange(close, holding.averageCost) : null),
      dailyReturnPct: formatPct(close ? pctChange(close, previousClose) : null),
    },
  };
}

export class PortfolioService {
  constructor(private readonly deps: PortfolioServiceDeps) {}

  /** Pesos, valor total y posiciones derivados de las órdenes (FR-013 a FR-019). */
  async getPortfolio(userId: number): Promise<PortfolioBody> {
    if (!(await this.deps.users.exists(userId))) {
      throw new NotFoundError(`User ${userId} not found`);
    }
    const holdings = computeHoldings(
      await this.deps.holdings.findHoldingOrders(this.deps.manager, userId),
    );
    const held = [...holdings.positions].filter(([, p]) => p.quantity > 0);
    const ids = held.map(([id]) => id);
    const [instruments, prices] = await Promise.all([
      this.deps.instruments.findByIds(ids),
      this.deps.marketData.findLatestByInstrumentIds(ids),
    ]);
    const byId = new Map(instruments.map((i) => [i.id, i]));

    const valued = held
      .flatMap(([id, holding]) => {
        const instrument = byId.get(id);
        return instrument ? [valuePosition(instrument, holding, prices.get(id))] : [];
      })
      .sort((a, b) => a.body.ticker.localeCompare(b.body.ticker));

    const positionsValue = valued.reduce(
      (sum, v) => (v.marketValue ? sum.plus(v.marketValue) : sum),
      toDecimal(0),
    );
    return {
      userId,
      availableCash: formatMoney(holdings.availableCash),
      reservedCash: formatMoney(holdings.reservedCash),
      totalAccountValue: formatMoney(holdings.cashBalance.plus(positionsValue)),
      positions: valued.map((v) => v.body),
    };
  }
}
