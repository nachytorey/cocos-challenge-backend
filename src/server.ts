import 'reflect-metadata';
import type { Server } from 'node:http';
import type { Express } from 'express';
import type { DataSource } from 'typeorm';
import { createApp, createLifecycle, type Lifecycle } from './app';
import { getConfig, type Config } from './config';
import { createDataSource } from './data-source';
import { createLogger, type Logger } from './shared/logger';

export interface ServerDeps {
  app: Express;
  config: Config;
  dataSource: DataSource;
  logger: Logger;
  lifecycle: Lifecycle;
}

export interface RunningServer {
  server: Server;
  shutdown: () => Promise<void>;
}

/**
 * Levanta el servidor y devuelve un `shutdown` ordenado (principio XVII): marca el servicio
 * como no listo, deja de aceptar conexiones, espera los requests en curso y cierra la base.
 */
export function startServer({
  app,
  config,
  dataSource,
  logger,
  lifecycle,
}: ServerDeps): RunningServer {
  const server = app.listen(config.port);
  // Fallar rápido y con un mensaje claro si no se puede escuchar (p. ej. puerto ocupado).
  server.on('error', (err: NodeJS.ErrnoException) => {
    const message =
      err.code === 'EADDRINUSE'
        ? `Port ${config.port} is already in use; set PORT to a free port`
        : `Cannot listen on port ${config.port}`;
    logger.fatal({ err, port: config.port }, message);
    process.exit(1);
  });
  server.requestTimeout = config.requestTimeoutMs + 1000;
  server.headersTimeout = Math.min(config.requestTimeoutMs, 60_000);

  let closing: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    closing ??= (async () => {
      lifecycle.markShuttingDown();
      const forced = setTimeout(() => {
        logger.error('graceful shutdown timed out; exiting');
        process.exit(1);
      }, config.shutdownTimeoutMs);
      forced.unref();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (dataSource.isInitialized) await dataSource.destroy();
      clearTimeout(forced);
      logger.info('shutdown complete');
    })();
    return closing;
  };

  return { server, shutdown };
}

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger({ level: config.logLevel });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled rejection');
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    process.exit(1);
  });

  const dataSource = createDataSource(config);
  await dataSource.initialize();
  const lifecycle = createLifecycle();
  const app = createApp({ config, dataSource, logger, lifecycle });
  const { server, shutdown } = startServer({ app, config, dataSource, logger, lifecycle });
  server.on('listening', () => logger.info({ port: config.port }, 'server listening'));

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      logger.info({ signal }, 'shutting down');
      void shutdown().then(() => process.exit(0));
    });
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Failed to start: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
}
