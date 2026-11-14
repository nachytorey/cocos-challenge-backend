import { Router } from 'express';
import { problem, registry, withCommonResponses } from '../shared/http/openapi';
import { validate } from '../shared/http/validate';
import { portfolioSchemas, type PortfolioController } from './portfolio.controller';
import { PortfolioParams, PortfolioResponse } from './portfolio.schemas';

registry.registerPath({
  method: 'get',
  path: '/v1/users/{userId}/portfolio',
  tags: ['portfolio'],
  summary: 'Portfolio de un usuario',
  request: { params: PortfolioParams },
  responses: withCommonResponses('get', {
    '200': {
      description: 'Pesos disponibles y reservados, valor total y posiciones',
      content: { 'application/json': { schema: PortfolioResponse } },
    },
    '400': problem('VALIDATION_FAILED'),
    '404': problem('NOT_FOUND (usuario)'),
  }),
});

export function portfolioRouter(controller: PortfolioController): Router {
  const router = Router();
  router.get('/users/:userId/portfolio', validate(portfolioSchemas), controller.get);
  return router;
}
