import 'reflect-metadata';
import { types } from 'pg';
import { DataSource } from 'typeorm';
import { getConfig, type Config } from './config';
import { Instrument } from './instruments/instrument.entity';
import { MarketData } from './market-data/market-data.entity';
import { Baseline1731542400001 } from './migrations/0001-baseline';
import { IdempotencyKeys1731542400002 } from './migrations/0002-idempotency-keys';
import { IdempotencyKey } from './orders/idempotency-key.entity';
import { Order } from './orders/order.entity';
import { User } from './users/user.entity';

const TIMESTAMP_WITHOUT_TZ = 1114;
const DATE = 1082;

// TIMESTAMP sin zona: se interpreta siempre como UTC, sin depender de la zona del proceso.
types.setTypeParser(TIMESTAMP_WITHOUT_TZ, (value) => new Date(`${value.replace(' ', 'T')}Z`));
// DATE: se mantiene como 'YYYY-MM-DD' para no convertirlo a medianoche local.
types.setTypeParser(DATE, (value) => value);

export const entities = [User, Instrument, Order, MarketData, IdempotencyKey];
export const migrations = [Baseline1731542400001, IdempotencyKeys1731542400002];

type DataSourceConfig = Pick<
  Config,
  'databaseUrl' | 'dbPoolMax' | 'dbStatementTimeoutMs' | 'dbLockTimeoutMs' | 'dbIdleInTxTimeoutMs'
>;

export function createDataSource(config: DataSourceConfig): DataSource {
  return new DataSource({
    type: 'postgres',
    url: config.databaseUrl,
    entities,
    migrations,
    synchronize: false,
    logging: false,
    extra: {
      max: config.dbPoolMax,
      // Ninguna query ni lock espera indefinidamente (principios IV y XVII).
      options: [
        `-c statement_timeout=${config.dbStatementTimeoutMs}`,
        `-c lock_timeout=${config.dbLockTimeoutMs}`,
        `-c idle_in_transaction_session_timeout=${config.dbIdleInTxTimeoutMs}`,
      ].join(' '),
    },
  });
}

/** Instancia que usa el CLI de migraciones de TypeORM (`npm run migration:run`). */
export default createDataSource(getConfig());
