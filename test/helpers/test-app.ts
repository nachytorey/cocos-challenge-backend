import type { Express } from 'express';
import type { DataSource } from 'typeorm';
import { createApp, createLifecycle, type Lifecycle } from '../../src/app';
import type { Config } from '../../src/config';
import { createLogger } from '../../src/shared/logger';
import { getTestDataSource, testConfig } from './db';

export interface TestApp {
  app: Express;
  dataSource: DataSource;
  config: Config;
  lifecycle: Lifecycle;
}

/** Arma la app real (composition root) contra la base de test, sin levantar el servidor. */
export async function buildTestApp(overrides: Partial<Config> = {}): Promise<TestApp> {
  const dataSource = await getTestDataSource();
  const config = testConfig(overrides);
  const lifecycle = createLifecycle();
  const logger = createLogger({ level: 'silent' });
  const app = createApp({ config, dataSource, logger, lifecycle });
  return { app, dataSource, config, lifecycle };
}
