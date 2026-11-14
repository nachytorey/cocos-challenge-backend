import { PriceUnavailableError, ValidationFailedError } from '../shared/errors';
import {
  LimitOrderStrategy,
  MarketOrderStrategy,
  orderTypeStrategies,
} from './order-type.strategy';

describe('MarketOrderStrategy', () => {
  const market = new MarketOrderStrategy();

  it('usa el último cierre redondeado a 2 decimales', () => {
    expect(market.resolvePrice({ instrumentId: 47 }, '925.8549').toFixed(2)).toBe('925.85');
  });

  it('queda FILLED', () => {
    expect(market.initialStatus()).toBe('FILLED');
  });

  it('rechaza que venga precio', () => {
    expect(() => market.resolvePrice({ instrumentId: 47, price: '900' }, '925.85')).toThrow(
      ValidationFailedError,
    );
  });

  it('sin precio de mercado lanza PriceUnavailableError', () => {
    expect(() => market.resolvePrice({ instrumentId: 47 }, undefined)).toThrow(
      PriceUnavailableError,
    );
    expect(() => market.resolvePrice({ instrumentId: 47 }, '0')).toThrow(PriceUnavailableError);
  });
});

describe('LimitOrderStrategy', () => {
  const limit = new LimitOrderStrategy();

  it('usa el precio enviado aunque haya precio de mercado', () => {
    expect(limit.resolvePrice({ instrumentId: 47, price: '900.5' }, '925.85').toFixed(2)).toBe(
      '900.50',
    );
  });

  it('queda NEW', () => {
    expect(limit.initialStatus()).toBe('NEW');
  });

  it('exige precio', () => {
    expect(() => limit.resolvePrice({ instrumentId: 47 }, '925.85')).toThrow(ValidationFailedError);
  });
});

describe('orderTypeStrategies', () => {
  it('tiene una estrategia por tipo de orden', () => {
    expect(orderTypeStrategies.MARKET).toBeInstanceOf(MarketOrderStrategy);
    expect(orderTypeStrategies.LIMIT).toBeInstanceOf(LimitOrderStrategy);
  });
});
