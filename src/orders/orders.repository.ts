import type { EntityManager } from 'typeorm';
import { Instrument } from '../instruments/instrument.entity';
import { IdempotencyKey } from './idempotency-key.entity';
import { Order, type OrderStatus } from './order.entity';

export type NewOrder = Omit<Order, 'id'>;
export type NewIdempotencyKey = Omit<IdempotencyKey, 'id' | 'createdAt'>;

export class OrdersRepository {
  async findInstrument(manager: EntityManager, id: number): Promise<Instrument | null> {
    return manager.findOneBy(Instrument, { id });
  }

  async insert(manager: EntityManager, order: NewOrder): Promise<Order> {
    return manager.save(Order, manager.create(Order, order));
  }

  async findIdempotencyKey(
    manager: EntityManager,
    userId: number,
    key: string,
  ): Promise<IdempotencyKey | null> {
    return manager.findOneBy(IdempotencyKey, { userId, key });
  }

  async insertIdempotencyKey(manager: EntityManager, row: NewIdempotencyKey): Promise<void> {
    await manager.save(IdempotencyKey, manager.create(IdempotencyKey, row));
  }

  async findByIdForUser(
    manager: EntityManager,
    orderId: number,
    userId: number,
  ): Promise<Order | null> {
    return manager.findOneBy(Order, { id: orderId, userId });
  }

  /** Único UPDATE permitido sobre `orders`: la transición NEW → CANCELLED (principio IV). */
  async updateStatus(manager: EntityManager, orderId: number, status: OrderStatus): Promise<void> {
    await manager.update(Order, { id: orderId }, { status });
  }
}
