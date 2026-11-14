import { Router, type RequestHandler } from 'express';
import { problem, registry, withCommonResponses } from '../shared/http/openapi';
import { validate } from '../shared/http/validate';
import { cancelOrderSchemas, createOrderSchemas, type OrdersController } from './orders.controller';
import {
  CancelOrderBody,
  CancelOrderParams,
  CreateOrderBody,
  IdempotencyHeaders,
  OrderResponse,
} from './orders.schemas';

const orderContent = { 'application/json': { schema: OrderResponse } };

registry.registerPath({
  method: 'post',
  path: '/v1/orders',
  tags: ['orders'],
  summary: 'Enviar una orden de compra o venta',
  description:
    'MARKET se ejecuta al último cierre y queda FILLED. LIMIT queda NEW con el precio enviado. ' +
    'Si faltan pesos o acciones, la orden se registra REJECTED (igual responde 201). Repetir la ' +
    'misma Idempotency-Key con el mismo body devuelve la orden original (200).',
  request: {
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: CreateOrderBody } } },
  },
  responses: withCommonResponses('post', {
    '201': { description: 'Orden registrada (FILLED, NEW o REJECTED)', content: orderContent },
    '200': {
      description: 'Replay de una Idempotency-Key con el mismo body',
      content: orderContent,
    },
    '400': problem('VALIDATION_FAILED'),
    '404': problem('NOT_FOUND (usuario o instrumento)'),
    '409': problem('CONCURRENT_REQUEST (reintentar con la misma Idempotency-Key)'),
    '422': problem('IDEMPOTENCY_KEY_REUSED, PRICE_UNAVAILABLE o ZERO_QUANTITY'),
  }),
});

registry.registerPath({
  method: 'post',
  path: '/v1/orders/{orderId}/cancellation',
  tags: ['orders'],
  summary: 'Cancelar una orden NEW',
  request: {
    params: CancelOrderParams,
    body: { required: true, content: { 'application/json': { schema: CancelOrderBody } } },
  },
  responses: withCommonResponses('post', {
    '200': { description: 'Orden cancelada', content: orderContent },
    '400': problem('VALIDATION_FAILED'),
    '404': problem('La orden no existe o no pertenece al usuario'),
    '409': problem('ORDER_NOT_CANCELLABLE: la orden no está en estado NEW; o CONCURRENT_REQUEST'),
  }),
});

export function ordersRouter(controller: OrdersController, limiter: RequestHandler): Router {
  const router = Router();
  router.post('/orders', limiter, validate(createOrderSchemas), controller.create);
  router.post(
    '/orders/:orderId/cancellation',
    limiter,
    validate(cancelOrderSchemas),
    controller.cancel,
  );
  return router;
}
