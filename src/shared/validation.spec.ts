import { Int4Id, Int4IdParam, INT4_MAX, MAX_NUMERIC_10_2, NoNullChars } from './validation';

describe('Int4Id (identificadores y cantidades que caben en un INT de Postgres)', () => {
  it('acepta de 1 a 2147483647', () => {
    expect(Int4Id.safeParse(1).success).toBe(true);
    expect(Int4Id.safeParse(INT4_MAX).success).toBe(true);
  });

  it.each([0, -1, 1.5, INT4_MAX + 1, 99999999999, Number.MAX_SAFE_INTEGER, NaN, Infinity])(
    'rechaza %p',
    (value) => {
      expect(Int4Id.safeParse(value).success).toBe(false);
    },
  );

  it('el máximo es el del INT de Postgres', () => {
    expect(INT4_MAX).toBe(2 ** 31 - 1);
  });
});

describe('Int4IdParam (el mismo rango para params y query, que llegan como string)', () => {
  it('convierte el string y respeta el rango', () => {
    expect(Int4IdParam.parse('42')).toBe(42);
    expect(Int4IdParam.safeParse(String(INT4_MAX)).success).toBe(true);
    expect(Int4IdParam.safeParse(String(INT4_MAX + 1)).success).toBe(false);
    expect(Int4IdParam.safeParse('99999999999').success).toBe(false);
  });

  it.each(['abc', '', '0', '-3', '1.5'])('rechaza %p', (value) => {
    expect(Int4IdParam.safeParse(value).success).toBe(false);
  });
});

describe('NoNullChars (Postgres no acepta U+0000 en texto)', () => {
  it('acepta texto normal y unicode', () => {
    expect(NoNullChars.safeParse('pampa').success).toBe(true);
    expect(NoNullChars.safeParse('€💸').success).toBe(true);
  });

  it('rechaza el carácter nulo en cualquier posición', () => {
    expect(NoNullChars.safeParse('pa\u0000m').success).toBe(false);
    expect(NoNullChars.safeParse('\u0000').success).toBe(false);
  });
});

describe('MAX_NUMERIC_10_2', () => {
  it('es el mayor valor de NUMERIC(10,2)', () => {
    expect(MAX_NUMERIC_10_2).toBe('99999999.99');
  });
});
