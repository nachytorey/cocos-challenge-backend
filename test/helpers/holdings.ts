import type { DataSource } from 'typeorm';
import { computeHoldings, type Holdings } from '../../src/holdings/compute-holdings';
import { HoldingsRepository } from '../../src/holdings/holdings.repository';

/** Lee los holdings de un usuario directo de la base, para verificar efectos en los tests. */
export async function holdingsOf(ds: DataSource, userId: number): Promise<Holdings> {
  return computeHoldings(await new HoldingsRepository().findHoldingOrders(ds.manager, userId));
}

export async function countOrders(ds: DataSource, userId: number): Promise<number> {
  const rows: { n: number }[] = await ds.query(
    'SELECT count(*)::int AS n FROM orders WHERE userid = $1',
    [userId],
  );
  return rows[0].n;
}
