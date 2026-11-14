import { z } from 'zod';
import { ValidationFailedError } from './errors';
import { decodeCursor, encodeCursor, PaginationQuery, toPage } from './pagination';

describe('cursor keyset', () => {
  it('encodeCursor y decodeCursor son inversos', () => {
    const cursor = { ticker: 'PAMP', id: 42 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('el cursor es opaco (base64url, sin caracteres especiales)', () => {
    expect(encodeCursor({ ticker: 'A/B+C', id: 1 })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each(['no-es-base64-json', encodeCursor({ ticker: 'A', id: 1 }).slice(0, 4), 'e30'])(
    'un cursor malformado (%s) lanza ValidationFailedError',
    (bad) => {
      expect(() => decodeCursor(bad)).toThrow(ValidationFailedError);
    },
  );
});

describe('PaginationQuery', () => {
  const schema = z.object(PaginationQuery);

  it('limit por defecto 20', () => {
    expect(schema.parse({})).toEqual({ limit: 20 });
  });

  it('limit máximo 100', () => {
    expect(schema.safeParse({ limit: '100' }).success).toBe(true);
    expect(schema.safeParse({ limit: '101' }).success).toBe(false);
    expect(schema.safeParse({ limit: '0' }).success).toBe(false);
  });
});

describe('toPage', () => {
  const rows = [
    { ticker: 'A', id: 1 },
    { ticker: 'B', id: 2 },
    { ticker: 'C', id: 3 },
  ];
  const cursorOf = (r: { ticker: string; id: number }) => r;

  it('con limit + 1 filas devuelve hasMore y el cursor de la última fila incluida', () => {
    const page = toPage(rows, 2, cursorOf);
    expect(page.data).toEqual(rows.slice(0, 2));
    expect(page.page.hasMore).toBe(true);
    expect(decodeCursor(page.page.nextCursor ?? '')).toEqual({ ticker: 'B', id: 2 });
  });

  it('sin más filas devuelve hasMore false y nextCursor null', () => {
    expect(toPage(rows, 3, cursorOf).page).toEqual({ hasMore: false, nextCursor: null });
  });
});
