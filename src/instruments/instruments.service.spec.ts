import { decodeCursor, encodeCursor } from '../shared/pagination';
import type { Instrument } from './instrument.entity';
import { InstrumentsService, type InstrumentsServiceDeps } from './instruments.service';

const instrument = (id: number, ticker: string): Instrument => ({
  id,
  ticker,
  name: `${ticker} S.A.`,
  type: 'ACCIONES',
});

function build(rows: Instrument[], prices: Record<number, string> = {}) {
  const deps: InstrumentsServiceDeps = {
    instruments: { search: jest.fn().mockResolvedValue(rows) },
    marketData: {
      findLatestByInstrumentIds: jest
        .fn()
        .mockResolvedValue(
          new Map(
            Object.entries(prices).map(([k, close]) => [
              Number(k),
              { close, previousClose: close },
            ]),
          ),
        ),
    },
  };
  return { service: new InstrumentsService(deps), deps };
}

describe('InstrumentsService.search', () => {
  it('agrega lastPrice formateado, o null si no hay precio', async () => {
    const { service } = build([instrument(1, 'AAA'), instrument(2, 'BBB')], { 1: '12.5' });
    const page = await service.search({ q: 'a', limit: 20 });
    expect(page.data).toEqual([
      {
        id: 1,
        ticker: 'AAA',
        name: 'AAA S.A.',
        type: 'ACCIONES',
        lastPrice: { amount: '12.50', currency: 'ARS' },
      },
      { id: 2, ticker: 'BBB', name: 'BBB S.A.', type: 'ACCIONES', lastPrice: null },
    ]);
    expect(page.page).toEqual({ hasMore: false, nextCursor: null });
  });

  it('pide limit + 1 filas, decodifica el cursor y arma la página siguiente', async () => {
    const { service, deps } = build([
      instrument(1, 'AAA'),
      instrument(2, 'BBB'),
      instrument(3, 'CCC'),
    ]);
    const cursor = encodeCursor({ ticker: 'ZZ', id: 9 });
    const page = await service.search({ q: 'x', limit: 2, cursor });
    expect(deps.instruments.search).toHaveBeenCalledWith({
      q: 'x',
      limit: 3,
      after: { ticker: 'ZZ', id: 9 },
    });
    expect(page.data).toHaveLength(2);
    expect(decodeCursor(page.page.nextCursor ?? '')).toEqual({ ticker: 'BBB', id: 2 });
  });

  it('solo consulta precios de los instrumentos de la página', async () => {
    const { service, deps } = build([instrument(1, 'AAA'), instrument(2, 'BBB')]);
    await service.search({ q: 'x', limit: 1 });
    expect(deps.marketData.findLatestByInstrumentIds).toHaveBeenCalledWith([1]);
  });
});
