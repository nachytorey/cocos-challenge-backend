import { z } from 'zod';
import { MoneySchema } from '../orders/orders.schemas';
import { registry } from '../shared/http/openapi';
import { PaginationQuery } from '../shared/pagination';

export const SearchQuery = z
  .object({
    q: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .openapi({ description: 'Texto a buscar en ticker o nombre (sin distinguir mayúsculas)' }),
    ...PaginationQuery,
  })
  .strict();

export type SearchInput = z.infer<typeof SearchQuery>;

export const InstrumentResponse = registry.register(
  'Instrument',
  z.object({
    id: z.number().int(),
    ticker: z.string(),
    name: z.string(),
    type: z.string().openapi({ example: 'ACCIONES' }),
    lastPrice: MoneySchema.nullable(),
  }),
);

export const InstrumentPageResponse = registry.register(
  'InstrumentPage',
  z.object({
    data: z.array(InstrumentResponse),
    page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
  }),
);

export type InstrumentBody = z.infer<typeof InstrumentResponse>;
