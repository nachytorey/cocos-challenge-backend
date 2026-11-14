import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const InstrumentType = { STOCK: 'ACCIONES', CURRENCY: 'MONEDA' } as const;

/** Tabla heredada `instruments`. El tipo MONEDA (ARS) representa los pesos. */
@Entity('instruments')
export class Instrument {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  ticker: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  type: string;
}
