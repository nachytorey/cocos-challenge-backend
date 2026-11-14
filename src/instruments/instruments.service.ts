import type { MarketDataRepository } from '../market-data/market-data.repository';
import { formatMoney, toDecimal } from '../shared/money';
import { decodeCursor, toPage, type Page } from '../shared/pagination';
import type { InstrumentsRepository } from './instruments.repository';
import type { InstrumentBody, SearchInput } from './instruments.schemas';

export interface InstrumentsServiceDeps {
  instruments: Pick<InstrumentsRepository, 'search'>;
  marketData: Pick<MarketDataRepository, 'findLatestByInstrumentIds'>;
}

export class InstrumentsService {
  constructor(private readonly deps: InstrumentsServiceDeps) {}

  /** Busca activos y agrega el último precio de cada uno (FR-020 a FR-022). */
  async search({ q, limit, cursor }: SearchInput): Promise<Page<InstrumentBody>> {
    const rows = await this.deps.instruments.search({
      q,
      limit: limit + 1,
      after: cursor ? decodeCursor(cursor) : undefined,
    });
    const page = toPage(rows, limit, (i) => ({ ticker: i.ticker, id: i.id }));
    const prices = await this.deps.marketData.findLatestByInstrumentIds(page.data.map((i) => i.id));
    return {
      page: page.page,
      data: page.data.map((i) => {
        const price = prices.get(i.id);
        return {
          id: i.id,
          ticker: i.ticker,
          name: i.name,
          type: i.type,
          lastPrice: price ? formatMoney(toDecimal(price.close)) : null,
        };
      }),
    };
  }
}
