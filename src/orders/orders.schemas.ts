import { z } from 'zod';
import { formatMoney, toDecimal } from '../shared/money';
import { registry } from '../shared/http/openapi';
import { Int4Id, Int4IdParam, MAX_NUMERIC_10_2 } from '../shared/validation';
import { OrderSides, OrderStatuses, OrderTypes, type Order } from './order.entity';

const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;
/** Largo de MAX_NUMERIC_10_2: más caracteres que eso nunca puede ser válido. */
const MAX_DECIMAL_LENGTH = MAX_NUMERIC_10_2.length;

/**
 * Decimal positivo con hasta 2 decimales, como string (nunca número JSON), que cabe en una
 * columna NUMERIC(10,2). El rango solo se evalúa cuando el formato es válido: así un texto como
 * "abc" produce un error de validación y no una excepción de la librería decimal.
 */
const PositiveDecimal = z
  .string()
  .max(MAX_DECIMAL_LENGTH, `must have at most ${MAX_DECIMAL_LENGTH} characters`)
  .regex(DECIMAL_PATTERN, 'must be a decimal string with up to 2 decimals')
  .superRefine((value, ctx) => {
    if (value.length > MAX_DECIMAL_LENGTH || !DECIMAL_PATTERN.test(value)) return;
    const amount = toDecimal(value);
    if (amount.lte(0)) {
      ctx.addIssue({ code: 'custom', message: 'must be greater than 0' });
    } else if (amount.gt(MAX_NUMERIC_10_2)) {
      ctx.addIssue({ code: 'custom', message: `must be at most ${MAX_NUMERIC_10_2}` });
    }
  });

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
      userId: Int4Id,
      instrumentId: Int4Id,
      side: z.enum(['BUY', 'SELL']),
      type: z.enum(OrderTypes),
      currency: z.literal('ARS').openapi({ description: 'Moneda de amount y price' }),
      quantity: Int4Id.optional(),
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

export const CancelOrderParams = z
  .object({
    orderId: Int4IdParam,
  })
  .strict();

export const CancelOrderBody = z
  .object({ userId: Int4Id.openapi({ description: 'Dueño de la orden' }) })
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
