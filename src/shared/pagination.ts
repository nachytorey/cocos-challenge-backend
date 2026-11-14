import { z } from 'zod';
import { ValidationFailedError } from './errors';
import { hasNoNullChars, Int4Id } from './validation';

/** Esquema único de paginación de la API (principio VI): cursor keyset + limit acotado. */
export const PaginationQuery = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(),
};

/** `ticker` es VARCHAR(10) y `id` es INT: un cursor fuera de esos rangos nunca es válido. */
const KeysetCursor = z
  .object({ ticker: z.string().max(10).refine(hasNoNullChars), id: Int4Id })
  .strict();
export type KeysetCursor = z.infer<typeof KeysetCursor>;

export interface Page<T> {
  data: T[];
  page: { nextCursor: string | null; hasMore: boolean };
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

const invalidCursor = () =>
  new ValidationFailedError('The cursor is invalid', [
    { field: 'cursor', message: 'must be a cursor returned by a previous page' },
  ]);

export function decodeCursor(raw: string): KeysetCursor {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  const parsed = KeysetCursor.safeParse(decoded);
  if (!parsed.success) throw invalidCursor();
  return parsed.data;
}

/** Recibe hasta `limit + 1` filas: la fila extra solo indica que hay otra página. */
export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => KeysetCursor): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    page: { nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null, hasMore },
  };
}
