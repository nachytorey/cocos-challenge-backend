import { In, type DataSource } from 'typeorm';
import type { KeysetCursor } from '../shared/pagination';
import { Instrument, InstrumentType } from './instrument.entity';

export interface SearchParams {
  q: string;
  limit: number;
  after?: KeysetCursor;
}

/** Escapa los comodines de LIKE para que el texto del usuario se busque literal. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class InstrumentsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByIds(ids: number[]): Promise<Instrument[]> {
    if (ids.length === 0) return [];
    return this.dataSource.getRepository(Instrument).findBy({ id: In(ids) });
  }

  /** Búsqueda por ticker o nombre (case-insensitive), sin MONEDA, paginada por (ticker, id). */
  async search({ q, limit, after }: SearchParams): Promise<Instrument[]> {
    const query = this.dataSource
      .getRepository(Instrument)
      .createQueryBuilder('i')
      .where(`(i.ticker ILIKE :pattern ESCAPE '\\' OR i.name ILIKE :pattern ESCAPE '\\')`, {
        pattern: `%${escapeLike(q)}%`,
      })
      .andWhere('i.type <> :currency', { currency: InstrumentType.CURRENCY })
      .orderBy('i.ticker', 'ASC')
      .addOrderBy('i.id', 'ASC')
      .limit(limit);
    if (after) {
      query.andWhere('(i.ticker, i.id) > (:afterTicker, :afterId)', {
        afterTicker: after.ticker,
        afterId: after.id,
      });
    }
    return query.getMany();
  }
}
