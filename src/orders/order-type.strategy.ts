import { PriceUnavailableError, ValidationFailedError } from '../shared/errors';
import { toDecimal, type Decimal } from '../shared/money';
import type { OrderStatus, OrderType } from './order.entity';

export interface PriceInput {
  instrumentId: number;
  price?: string;
}

/**
 * Patrón Strategy (plan.md, Pattern Decision): el tipo de orden decide de dónde sale el precio
 * y con qué estado nace la orden. Agregar un tipo nuevo (p. ej. STOP) es agregar una estrategia.
 */
export interface OrderTypeStrategy {
  resolvePrice(input: PriceInput, lastClose: string | undefined): Decimal;
  initialStatus(): OrderStatus;
}

/** MARKET: se ejecuta al último cierre y queda FILLED. */
export class MarketOrderStrategy implements OrderTypeStrategy {
  resolvePrice(input: PriceInput, lastClose: string | undefined): Decimal {
    if (input.price !== undefined) {
      throw new ValidationFailedError('MARKET orders must not include a price', [
        { field: 'price', message: 'not allowed for MARKET orders' },
      ]);
    }
    if (lastClose === undefined || toDecimal(lastClose).lte(0)) {
      throw new PriceUnavailableError(input.instrumentId);
    }
    return toDecimal(lastClose).toDecimalPlaces(2);
  }

  initialStatus(): OrderStatus {
    return 'FILLED';
  }
}

/** LIMIT: usa el precio enviado y queda NEW (no se simula el mercado). */
export class LimitOrderStrategy implements OrderTypeStrategy {
  /** El último cierre no se usa: una orden LIMIT siempre toma el precio enviado. */
  resolvePrice(input: PriceInput, _lastClose?: string): Decimal {
    if (input.price === undefined) {
      throw new ValidationFailedError('LIMIT orders require a price', [
        { field: 'price', message: 'required for LIMIT orders' },
      ]);
    }
    return toDecimal(input.price).toDecimalPlaces(2);
  }

  initialStatus(): OrderStatus {
    return 'NEW';
  }
}

export const orderTypeStrategies: Record<OrderType, OrderTypeStrategy> = {
  MARKET: new MarketOrderStrategy(),
  LIMIT: new LimitOrderStrategy(),
};
