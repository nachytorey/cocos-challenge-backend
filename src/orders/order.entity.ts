import { Column, Entity, PrimaryGeneratedColumn, type ValueTransformer } from 'typeorm';
import type { OrderSide, OrderStatus } from '../holdings/compute-holdings';

export const OrderSides = ['BUY', 'SELL', 'CASH_IN', 'CASH_OUT'] as const;
export const OrderStatuses = ['NEW', 'FILLED', 'REJECTED', 'CANCELLED'] as const;
export const OrderTypes = ['MARKET', 'LIMIT'] as const;
export type OrderType = (typeof OrderTypes)[number];
export type { OrderSide, OrderStatus };

/**
 * `orders.datetime` es TIMESTAMP sin zona (esquema heredado). Se escribe siempre en UTC como
 * texto, para que la zona horaria del proceso no altere el valor guardado.
 */
const utcTimestamp: ValueTransformer = {
  to: (value: Date | undefined) =>
    value === undefined ? undefined : value.toISOString().replace('T', ' ').replace('Z', ''),
  from: (value: Date | null) => value,
};

/** Tabla heredada `orders`; es la única fuente de saldos y posiciones. */
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: number;

  @Column({ name: 'instrumentid', type: 'integer' })
  instrumentId: number;

  @Column({ name: 'userid', type: 'integer' })
  userId: number;

  @Column({ type: 'integer' })
  size: number;

  /** NUMERIC(10,2): el driver lo devuelve como string decimal. */
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price: string;

  @Column({ type: 'varchar', length: 10 })
  type: OrderType;

  @Column({ type: 'varchar', length: 10 })
  side: OrderSide;

  @Column({ type: 'varchar', length: 20 })
  status: OrderStatus;

  @Column({ type: 'timestamp without time zone', transformer: utcTimestamp })
  datetime: Date;
}
