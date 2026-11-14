import { z } from 'zod';

/**
 * Límites de lo que la base de datos puede guardar. Validar el rango en el borde (principio III)
 * evita que un pedido inválido llegue a Postgres y termine en un 500.
 */

/** Mayor valor de un `INT` de PostgreSQL (4 bytes con signo). */
export const INT4_MAX = 2_147_483_647;

/** Mayor valor de una columna `NUMERIC(10,2)`. */
export const MAX_NUMERIC_10_2 = '99999999.99';

/** Identificador o cantidad: entero de 1 a INT4_MAX. */
export const Int4Id = z.number().int().min(1).max(INT4_MAX);

/** Igual que `Int4Id`, para params y query, que llegan como string. */
export const Int4IdParam = z.coerce.number().int().min(1).max(INT4_MAX);

/** PostgreSQL no admite U+0000 en un texto. */
export const hasNoNullChars = (value: string): boolean => !value.includes('\u0000');

export const NoNullChars = z.string().refine(hasNoNullChars, 'must not contain null characters');
