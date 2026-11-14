import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Clave de idempotencia de POST /v1/orders (principio IX). Se escribe en la misma transacción
 * que la orden; `UNIQUE (user_id, key)` la hace única por usuario.
 */
@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: number;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash: string;

  @Column({ name: 'order_id', type: 'integer' })
  orderId: number;

  @Column({ name: 'response_status', type: 'smallint' })
  responseStatus: number;

  @Column({ name: 'response_body', type: 'jsonb' })
  responseBody: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
