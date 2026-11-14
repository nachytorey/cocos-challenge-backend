import { Router } from 'express';
import type { DataSource } from 'typeorm';
import { z } from 'zod';
import { registry, withCommonResponses } from '../shared/http/openapi';

export interface HealthDeps {
  dataSource: DataSource;
  isShuttingDown: () => boolean;
}

const HealthStatus = z.object({ status: z.enum(['ok', 'unavailable']) });

registry.registerPath({
  method: 'get',
  path: '/health/live',
  tags: ['health'],
  summary: 'Liveness: el proceso responde',
  responses: withCommonResponses('get', {
    '200': {
      description: 'El proceso responde',
      content: { 'application/json': { schema: HealthStatus } },
    },
  }),
});

registry.registerPath({
  method: 'get',
  path: '/health/ready',
  tags: ['health'],
  summary: 'Readiness: la base de datos responde y el servicio no se está apagando',
  responses: withCommonResponses('get', {
    '200': { description: 'Listo', content: { 'application/json': { schema: HealthStatus } } },
    '503': {
      description: 'No listo (base caída o apagándose)',
      content: { 'application/json': { schema: HealthStatus } },
    },
  }),
});

async function databaseResponds(dataSource: DataSource): Promise<boolean> {
  if (!dataSource.isInitialized) return false;
  try {
    await dataSource.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export function healthRouter({ dataSource, isShuttingDown }: HealthDeps): Router {
  const router = Router();
  router.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  router.get('/health/ready', async (_req, res) => {
    const ready = !isShuttingDown() && (await databaseResponds(dataSource));
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
  });
  return router;
}
