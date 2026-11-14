import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { loadConfig, type Config } from '../../src/config';
import { createDataSource } from '../../src/data-source';

export function testConfig(overrides: Partial<Config> = {}): Config {
  const databaseUrl = process.env.DATABASE_URL_TEST;
  if (!databaseUrl) throw new Error('DATABASE_URL_TEST is required to run functional tests');
  return {
    ...loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      LOG_LEVEL: 'silent',
    }),
    ...overrides,
  };
}

let dataSource: DataSource | undefined;

/** DataSource compartido por archivo de test, con las migraciones aplicadas. */
export async function getTestDataSource(): Promise<DataSource> {
  if (!dataSource) {
    dataSource = createDataSource(testConfig());
    await dataSource.initialize();
    await dataSource.runMigrations();
  }
  return dataSource;
}

export async function closeTestDataSource(): Promise<void> {
  if (dataSource?.isInitialized) await dataSource.destroy();
  dataSource = undefined;
}

/** Vacía todas las tablas de negocio y reinicia los ids. */
export async function resetDb(ds: DataSource): Promise<void> {
  const rows: { tablename: string }[] = await ds.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await ds.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/** El enunciado del challenge y sus datos iniciales viven en `.challenge/`. */
export const CHALLENGE_SEED_PATH = join(__dirname, '..', '..', '.challenge', 'database.sql');

/** Ejecuta los INSERT de database.sql (el esquema ya lo crearon las migraciones). */
export async function loadChallengeSeed(ds: DataSource): Promise<void> {
  const sql = readFileSync(CHALLENGE_SEED_PATH, 'utf8');
  const inserts = sql.match(/INSERT INTO[\s\S]*?;/g) ?? [];
  for (const statement of inserts) {
    await ds.query(statement);
  }
}
