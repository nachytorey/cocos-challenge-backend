import dotenv from 'dotenv';
import { z } from 'zod';

const int = (fallback: number) => z.coerce.number().int().nonnegative().default(fallback);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),
  DATABASE_URL_TEST: z.string().optional(),
  DB_POOL_MAX: int(10),
  DB_STATEMENT_TIMEOUT_MS: int(5000),
  DB_LOCK_TIMEOUT_MS: int(5000),
  DB_IDLE_IN_TX_TIMEOUT_MS: int(10000),
  REQUEST_TIMEOUT_MS: int(10000),
  SHUTDOWN_TIMEOUT_MS: int(10000),
  TRUST_PROXY: int(0),
  CORS_ORIGINS: z.string().default(''),
  BODY_LIMIT: z.string().default('100kb'),
  RATE_LIMIT_WINDOW_MS: int(60000),
  RATE_LIMIT_MAX: int(300),
  ORDERS_RATE_LIMIT_MAX: int(30),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

type Env = z.infer<typeof EnvSchema>;

export interface Config {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  databaseUrl: string;
  dbPoolMax: number;
  dbStatementTimeoutMs: number;
  dbLockTimeoutMs: number;
  dbIdleInTxTimeoutMs: number;
  requestTimeoutMs: number;
  shutdownTimeoutMs: number;
  trustProxy: number;
  corsOrigins: string[];
  bodyLimit: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  ordersRateLimitMax: number;
  logLevel: Env['LOG_LEVEL'];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function toConfig(env: Env): Config {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    dbPoolMax: env.DB_POOL_MAX,
    dbStatementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
    dbLockTimeoutMs: env.DB_LOCK_TIMEOUT_MS,
    dbIdleInTxTimeoutMs: env.DB_IDLE_IN_TX_TIMEOUT_MS,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    trustProxy: env.TRUST_PROXY,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    bodyLimit: env.BODY_LIMIT,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    ordersRateLimitMax: env.ORDERS_RATE_LIMIT_MAX,
    logLevel: env.LOG_LEVEL,
  };
}

/** Valida las variables de entorno. Lanza ConfigError nombrando las variables inválidas. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return toConfig(parsed.data);
}

/**
 * Igual que loadConfig, pero ante un error lo escribe en stderr y termina el proceso (fail fast).
 * Se usa process.stderr porque el logger todavía no existe y `console` está prohibido.
 */
export function loadConfigOrExit(env: NodeJS.ProcessEnv): Config {
  try {
    return loadConfig(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

let cached: Config | undefined;

/** Única lectura de process.env de la aplicación. Carga .env fuera de producción. */
export function getConfig(): Config {
  if (!cached) {
    if (process.env.NODE_ENV !== 'production') dotenv.config({ quiet: true });
    cached = loadConfigOrExit(process.env);
  }
  return cached;
}
