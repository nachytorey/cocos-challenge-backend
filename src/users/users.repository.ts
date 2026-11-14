import type { DataSource, EntityManager } from 'typeorm';
import { User } from './user.entity';

export class UsersRepository {
  constructor(private readonly dataSource: DataSource) {}

  async exists(userId: number): Promise<boolean> {
    return this.dataSource.getRepository(User).exists({ where: { id: userId } });
  }

  /**
   * Bloquea la fila del usuario hasta el fin de la transacción: serializa las órdenes y
   * cancelaciones de un mismo usuario (research R4). Devuelve false si no existe.
   */
  async lockForUpdate(manager: EntityManager, userId: number): Promise<boolean> {
    const rows: unknown[] = await manager.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
      userId,
    ]);
    return rows.length > 0;
  }
}
