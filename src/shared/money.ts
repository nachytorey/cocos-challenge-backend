import Decimal from 'decimal.js';

/** Decimal con precisión suficiente y redondeo bancario para todo cálculo de dinero. */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
export type { Decimal };

export const CURRENCY = 'ARS' as const;

export interface Money {
  amount: string;
  currency: typeof CURRENCY;
}

export function toDecimal(value: Decimal.Value): Decimal {
  return new Dec(value);
}

function toFixed2(value: Decimal): string {
  const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  // Evita "-0.00" cuando un valor negativo muy chico redondea a cero.
  return (rounded.isZero() ? rounded.abs() : rounded).toFixed(2);
}

export function formatMoney(value: Decimal): Money {
  return { amount: toFixed2(value), currency: CURRENCY };
}

export function formatPct(value: Decimal | null): string | null {
  return value === null ? null : toFixed2(value);
}
