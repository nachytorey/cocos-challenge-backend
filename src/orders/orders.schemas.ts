import { z } from 'zod';
import { formatMoney, toDecimal } from '../shared/money';
import { registry } from '../shared/http/openapi';
import { OrderSides, OrderStatuses, OrderTypes, type Order } from './order.entity';

/** Decimal positivo con hasta 2 decimales, como string (nunca número JSON). */
const PositiveDecimal = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'must be a decimal string with up to 2 decimals')
  .refine((v) => toDecimal(v).gt(0), 'must be greater than 0');

export const MoneySchema = registry.register(
  'Money',
  z.object({
    amount: z.string().openapi({ example: '627500.00' }),
    currency: z.literal('ARS'),
  }),
);

export const CreateOrderBody = registry.register(
  'CreateOrderRequest',
  z
    .object({
      userId: z.number().int().positive(),
      instrumentId: z.number().int().positive(),
      side: z.enum(['BUY', 'SELL']),
      type: z.enum(OrderTypes),
      currency: z.literal('ARS').openapi({ description: 'Moneda de amount y price' }),
      quantity: z.number().int().positive().optional(),
      amount: PositiveDecimal.optional().openapi({ description: 'Monto total en pesos' }),
      price: PositiveDecimal.optional().openapi({ description: 'Precio límite (solo LIMIT)' }),
    })
    .strict()
    .superRefine((body, ctx) => {
      if ((body.quantity === undefined) === (body.amount === undefined)) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: 'exactly one of quantity or amount is required',
        });
      }
      if (body.type === 'LIMIT' && body.price === undefined) {
        ctx.addIssue({ code: 'custom', path: ['price'], message: 'required for LIMIT orders' });
      }
      if (body.type === 'MARKET' && body.price !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['price'], message: 'not allowed for MARKET orders' });
      }
    })
    .openapi({
      description: 'Exactamente uno de quantity o amount. price obligatorio solo en LIMIT.',
    }),
);

export type CreateOrderInput = z.infer<typeof CreateOrderBody>;

export const IdempotencyHeaders = z.object({
  'idempotency-key': z.string().min(8).max(255),
});

export const CancelOrderParams = z.object({
  orderId: z.coerce.number().int().positive(),
});

export const CancelOrderBody = z
  .object({ userId: z.number().int().positive().openapi({ description: 'Dueño de la orden' }) })
  .strict();

export const OrderResponse = registry.register(
  'Order',
  z.object({
    id: z.number().int(),
    userId: z.number().int(),
    instrumentId: z.number().int(),
    side: z.enum(OrderSides),
    type: z.enum(OrderTypes),
    status: z.enum(OrderStatuses),
    quantity: z.number().int(),
    price: MoneySchema,
    createdAt: z.string().openapi({ format: 'date-time' }),
  }),
);

export type OrderResponseBody = z.infer<typeof OrderResponse>;

/** La columna `size` se expone como `quantity`; fechas en ISO 8601 UTC. */
export function toOrderResponse(order: Order): OrderResponseBody {
  return {
    id: order.id,
    userId: order.userId,
    instrumentId: order.instrumentId,
    side: order.side,
    type: order.type,
    status: order.status,
    quantity: order.size,
    price: formatMoney(toDecimal(order.price)),
    createdAt: order.datetime.toISOString(),
  };
}
