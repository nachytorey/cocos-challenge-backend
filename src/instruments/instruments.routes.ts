import { Router } from 'express';
import { problem, registry, withCommonResponses } from '../shared/http/openapi';
import { validate } from '../shared/http/validate';
import { searchSchemas, type InstrumentsController } from './instruments.controller';
import { InstrumentPageResponse, SearchQuery } from './instruments.schemas';

registry.registerPath({
  method: 'get',
  path: '/v1/instruments',
  tags: ['instruments'],
  summary: 'Buscar activos por ticker o nombre',
  request: { query: SearchQuery },
  responses: withCommonResponses('get', {
    '200': {
      description: 'Página de instrumentos (excluye el instrumento de tipo MONEDA)',
      content: { 'application/json': { schema: InstrumentPageResponse } },
    },
    '400': problem('VALIDATION_FAILED'),
  }),
});

export function instrumentsRouter(controller: InstrumentsController): Router {
  const router = Router();
  router.get('/instruments', validate(searchSchemas), controller.search);
  return router;
}
