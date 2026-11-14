import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Tabla heredada `marketdata`: una fila por instrumento y día. */
@Entity('marketdata')
export class MarketData {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: number;

  @Column({ name: 'instrumentid', type: 'integer' })
  instrumentId: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  high: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  low: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  open: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  close: string | null;

  @Column({ name: 'previousclose', type: 'numeric', precision: 10, scale: 2, nullable: true })
  previousClose: string | null;

  /** DATE sin hora; se mantiene como string 'YYYY-MM-DD'. */
  @Column({ type: 'date' })
  date: string;
}
