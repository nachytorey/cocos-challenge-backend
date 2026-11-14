import type { RequestHandler } from 'express';
import { getValidated } from '../shared/http/validate';
import { CreateOrderBody, IdempotencyHeaders } from './orders.schemas';
import type { OrdersService } from './orders.service';

export const createOrderSchemas = { body: CreateOrderBody, headers: IdempotencyHeaders };

/** Solo transporte: toma el input validado, llama al service y elige el status HTTP. */
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  create: RequestHandler = async (req, res) => {
    const { body, headers } = getValidated(req, createOrderSchemas);
    const { order, replayed } = await this.service.create(body, headers['idempotency-key']);
    if (replayed) {
      res.status(200).json(order);
      return;
    }
    res.status(201).location(`/v1/orders/${order.id}`).json(order);
  };
}
