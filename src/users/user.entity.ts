import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Tabla heredada `users` de database.sql (columnas en minúscula). */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'accountnumber', type: 'varchar', length: 20, nullable: true })
  accountNumber: string | null;
}
