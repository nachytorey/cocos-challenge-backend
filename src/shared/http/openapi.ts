import { z } from '../zod-openapi';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
} from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

/** Registry único: cada archivo de rutas registra sus paths al cargarse el módulo. */
export const registry = new OpenAPIRegistry();

export const ProblemDetailsSchema = registry.register(
  'ProblemDetails',
  z
    .object({
      type: z.string(),
      title: z.string(),
      status: z.number().int(),
      code: z.string().openapi({ example: 'VALIDATION_FAILED' }),
      detail: z.string().optional(),
      errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
      traceId: z.string().optional(),
    })
    .openapi({ description: 'Error en formato Problem Details (RFC 9457)' }),
);

export function problem(description: string): ResponseConfig {
  return { description, content: { 'application/problem+json': { schema: ProblemDetailsSchema } } };
}

type Responses = Record<string, ResponseConfig>;

const BODY_METHODS = new Set(['post', 'put', 'patch']);

/** Agrega a toda operación las respuestas de error comunes del contrato (principio VI). */
export function withCommonResponses(method: string, responses: Responses): Responses {
  const common: Responses = {
    '403': problem('ORIGIN_NOT_ALLOWED o HTTPS_REQUIRED'),
    '429': {
      ...problem('RATE_LIMITED, con header Retry-After'),
      headers: { 'Retry-After': { schema: { type: 'integer' } } },
    },
    '500': problem('INTERNAL_ERROR'),
    '503': problem('REQUEST_TIMEOUT'),
  };
  if (BODY_METHODS.has(method)) common['413'] = problem('PAYLOAD_TOO_LARGE');
  return { ...common, ...responses };
}

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Cocos Challenge API',
      version: '1.0.0',
      description:
        'Importes como string decimal con moneda; fechas ISO 8601 en UTC; errores en formato Problem Details.',
    },
    servers: [{ url: 'http://localhost:3000' }],
  });
}

/** Sirve /docs-json y Swagger UI en /docs fuera de producción. */
export function openApiRouter(nodeEnv: string): Router {
  const router = Router();
  if (nodeEnv === 'production') return router;
  router.get('/docs-json', (_req, res) => {
    res.json(buildOpenApiDocument());
  });
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(undefined, { swaggerUrl: '/docs-json' }));
  return router;
}
