import { z } from 'zod';
import { registry } from '../shared/http/openapi';
import { MoneySchema } from '../orders/orders.schemas';

export const PortfolioParams = z
  .object({
    userId: z.coerce.number().int().positive(),
  })
  .strict();

const Percentage = z
  .string()
  .nullable()
  .openapi({ example: '-0.45', description: 'Porcentaje con 2 decimales; null si no hay precio' });

export const PositionResponse = registry.register(
  'Position',
  z.object({
    instrumentId: z.number().int(),
    ticker: z.string(),
    name: z.string(),
    quantity: z.number().int(),
    averageCost: MoneySchema,
    lastPrice: MoneySchema.nullable(),
    marketValue: MoneySchema.nullable().openapi({
      description: 'null si el instrumento no tiene precio',
    }),
    totalReturnPct: Percentage,
    dailyReturnPct: Percentage,
  }),
);

export const PortfolioResponse = registry.register(
  'Portfolio',
  z.object({
    userId: z.number().int(),
    availableCash: MoneySchema,
    reservedCash: MoneySchema,
    totalAccountValue: MoneySchema,
    positions: z.array(PositionResponse),
  }),
);

export type PortfolioBody = z.infer<typeof PortfolioResponse>;
export type PositionBody = z.infer<typeof PositionResponse>;
