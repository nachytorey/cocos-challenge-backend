import type { EntityManager } from 'typeorm';
import type { HoldingOrder } from './compute-holdings';

export class HoldingsRepository {
  /** Órdenes FILLED y NEW del usuario en orden cronológico, para `computeHoldings`. */
  async findHoldingOrders(manager: EntityManager, userId: number): Promise<HoldingOrder[]> {
    return manager.query(
      `SELECT instrumentid AS "instrumentId", side, status, size, price
         FROM orders
        WHERE userid = $1 AND status IN ('FILLED', 'NEW')
        ORDER BY datetime, id`,
      [userId],
    );
  }
}
