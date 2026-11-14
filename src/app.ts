import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express, type RequestHandler, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { DataSource } from 'typeorm';
import type { Config } from './config';
import { healthRouter } from './health/health.routes';
import { HoldingsRepository } from './holdings/holdings.repository';
import { InstrumentsController } from './instruments/instruments.controller';
import { InstrumentsRepository } from './instruments/instruments.repository';
import { instrumentsRouter } from './instruments/instruments.routes';
import { InstrumentsService } from './instruments/instruments.service';
import { MarketDataRepository } from './market-data/market-data.repository';
import { orderTypeStrategies } from './orders/order-type.strategy';
import { OrdersController } from './orders/orders.controller';
import { OrdersRepository } from './orders/orders.repository';
import { ordersRouter } from './orders/orders.routes';
import { OrdersService } from './orders/orders.service';
import { PortfolioController } from './portfolio/portfolio.controller';
import { portfolioRouter } from './portfolio/portfolio.routes';
import { PortfolioService } from './portfolio/portfolio.service';
import { NotFoundError, RateLimitedError } from './shared/errors';
import { errorHandler } from './shared/http/error-handler';
import { openApiRouter } from './shared/http/openapi';
import { originCheck } from './shared/http/origin-check';
import { requestTimeout } from './shared/http/request-timeout';
import { requireHttps } from './shared/http/require-https';
import type { Logger } from './shared/logger';
import { UsersRepository } from './users/users.repository';

export interface Lifecycle {
  isShuttingDown: () => boolean;
  markShuttingDown: () => void;
}

export function createLifecycle(): Lifecycle {
  let shuttingDown = false;
  return {
    isShuttingDown: () => shuttingDown,
    markShuttingDown: () => {
      shuttingDown = true;
    },
  };
}

export interface AppDeps {
  config: Config;
  dataSource: DataSource;
  logger: Logger;
  lifecycle: Lifecycle;
}

export function rateLimiter(windowMs: number, limit: number): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new RateLimitedError(Math.ceil(windowMs / 1000))),
  });
}

function requestId(req: express.Request): string {
  const header = req.headers['x-request-id'];
  return typeof header === 'string' && header.length > 0 && header.length <= 128
    ? header
    : randomUUID();
}

/** Rutas de negocio bajo /v1. Composition root: las dependencias se arman acá, por constructor. */
function v1Router({ config, dataSource, logger }: AppDeps): Router {
  const users = new UsersRepository(dataSource);
  const marketData = new MarketDataRepository(dataSource);
  const holdings = new HoldingsRepository();
  const orders = new OrdersRepository();
  const instruments = new InstrumentsRepository(dataSource);

  const ordersService = new OrdersService({
    transactions: dataSource,
    users,
    orders,
    marketData,
    holdings,
    strategies: orderTypeStrategies,
    logger,
  });

  const portfolioService = new PortfolioService({
    manager: dataSource.manager,
    users,
    holdings,
    marketData,
    instruments,
  });

  const instrumentsService = new InstrumentsService({ instruments, marketData });

  const router = Router();
  router.use(portfolioRouter(new PortfolioController(portfolioService)));
  router.use(instrumentsRouter(new InstrumentsController(instrumentsService)));
  router.use(
    ordersRouter(
      new OrdersController(ordersService),
      rateLimiter(config.rateLimitWindowMs, config.ordersRateLimitMax),
    ),
  );
  return router;
}

const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};

export function createApp(deps: AppDeps): Express {
  const { config, dataSource, logger, lifecycle } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(pinoHttp({ logger, genReqId: requestId }));
  app.use(requireHttps(config.nodeEnv));
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(originCheck(config.corsOrigins));
  app.use(rateLimiter(config.rateLimitWindowMs, config.rateLimitMax));
  app.use(requestTimeout(config.requestTimeoutMs));

  app.use(healthRouter({ dataSource, isShuttingDown: lifecycle.isShuttingDown }));
  app.use(openApiRouter(config.nodeEnv));
  app.use('/v1', v1Router(deps));

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
