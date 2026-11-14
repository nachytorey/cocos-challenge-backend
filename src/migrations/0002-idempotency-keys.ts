import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IdempotencyKeys1731542400002 implements MigrationInterface {
  name = 'IdempotencyKeys1731542400002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        key VARCHAR(255) NOT NULL,
        request_hash CHAR(64) NOT NULL,
        order_id INT NOT NULL REFERENCES orders(id),
        response_status SMALLINT NOT NULL,
        response_body JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_idempotency_keys_user_key UNIQUE (user_id, key)
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS idempotency_keys');
  }
}
