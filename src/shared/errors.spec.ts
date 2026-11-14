import {
  ConcurrentRequestError,
  DomainError,
  HttpsRequiredError,
  IdempotencyKeyReusedError,
  NotFoundError,
  OrderNotCancellableError,
  OriginNotAllowedError,
  PriceUnavailableError,
  RateLimitedError,
  RequestTimeoutError,
  ValidationFailedError,
  ZeroQuantityError,
} from './errors';

describe('errores de dominio', () => {
  it.each([
    [new NotFoundError(), 'NOT_FOUND'],
    [new ValidationFailedError('bad'), 'VALIDATION_FAILED'],
    [new OriginNotAllowedError(), 'ORIGIN_NOT_ALLOWED'],
    [new HttpsRequiredError(), 'HTTPS_REQUIRED'],
    [new OrderNotCancellableError(), 'ORDER_NOT_CANCELLABLE'],
    [new ConcurrentRequestError(), 'CONCURRENT_REQUEST'],
    [new IdempotencyKeyReusedError(), 'IDEMPOTENCY_KEY_REUSED'],
    [new PriceUnavailableError(7), 'PRICE_UNAVAILABLE'],
    [new ZeroQuantityError(), 'ZERO_QUANTITY'],
    [new RateLimitedError(10), 'RATE_LIMITED'],
    [new RequestTimeoutError(), 'REQUEST_TIMEOUT'],
  ])('%p lleva el code %s, un mensaje y ningún status HTTP', (err: DomainError, code) => {
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe(code);
    expect(err.message.length).toBeGreaterThan(0);
    expect(err).not.toHaveProperty('status');
    expect(err.name).toBe(err.constructor.name);
  });

  it('ValidationFailedError conserva los errores por campo', () => {
    const err = new ValidationFailedError('bad', [{ field: 'amount', message: 'required' }]);
    expect(err.errors).toEqual([{ field: 'amount', message: 'required' }]);
    expect(new ValidationFailedError('x').errors).toEqual([]);
  });

  it('PriceUnavailableError nombra el instrumento', () => {
    expect(new PriceUnavailableError(47).message).toMatch(/47/);
  });
});
