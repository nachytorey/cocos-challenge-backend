import type { DataSource, EntityManager } from 'typeorm';

export interface LatestPrice {
  close: string;
  previousClose: string | null;
}

interface LatestPriceRow {
  instrumentId: number;
  close: string;
  previousClose: string | null;
}

export class MarketDataRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** Último cierre por instrumento: la fila con mayor `date` (desempate por `id`). */
  async findLatestByInstrumentIds(
    instrumentIds: number[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<number, LatestPrice>> {
    if (instrumentIds.length === 0) return new Map();
    const rows: LatestPriceRow[] = await manager.query(
      `SELECT DISTINCT ON (instrumentid)
              instrumentid AS "instrumentId", close, previousclose AS "previousClose"
         FROM marketdata
        WHERE instrumentid = ANY($1) AND close IS NOT NULL
        ORDER BY instrumentid, date DESC, id DESC`,
      [instrumentIds],
    );
    return new Map(
      rows.map((r) => [r.instrumentId, { close: r.close, previousClose: r.previousClose }]),
    );
  }
}
