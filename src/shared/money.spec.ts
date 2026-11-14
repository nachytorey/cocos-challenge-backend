import { formatMoney, formatPct, toDecimal } from './money';

describe('money', () => {
  it('formatMoney devuelve string con 2 decimales y moneda ARS', () => {
    expect(formatMoney(toDecimal('1234.5'))).toEqual({ amount: '1234.50', currency: 'ARS' });
  });

  it('redondea con ROUND_HALF_EVEN', () => {
    expect(formatMoney(toDecimal('0.125')).amount).toBe('0.12');
    expect(formatMoney(toDecimal('0.135')).amount).toBe('0.14');
  });

  it('suma sin errores de punto flotante', () => {
    expect(formatMoney(toDecimal('0.1').plus('0.2')).amount).toBe('0.30');
  });

  it('formatea negativos', () => {
    expect(formatMoney(toDecimal('-10')).amount).toBe('-10.00');
  });

  it('no devuelve "-0.00" cuando un negativo chico redondea a cero', () => {
    expect(formatMoney(toDecimal('-0.001')).amount).toBe('0.00');
  });

  it('formatPct devuelve string con 2 decimales o null', () => {
    expect(formatPct(toDecimal('-0.44623655'))).toBe('-0.45');
    expect(formatPct(toDecimal('8'))).toBe('8.00');
    expect(formatPct(null)).toBeNull();
  });
});
