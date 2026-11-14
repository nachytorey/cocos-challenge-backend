/**
 * Errores de dominio. Llevan solo un `code` estable: el status HTTP lo decide únicamente el
 * middleware de errores (principio XIV).
 */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'ORIGIN_NOT_ALLOWED'
  | 'HTTPS_REQUIRED'
  | 'NOT_FOUND'
  | 'ORDER_NOT_CANCELLABLE'
  | 'CONCURRENT_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'PRICE_UNAVAILABLE'
  | 'ZERO_QUANTITY'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'REQUEST_TIMEOUT';

export interface FieldError {
  field: string;
  message: string;
}

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message);
  }
}

export class ValidationFailedError extends DomainError {
  constructor(
    message: string,
    readonly errors: FieldError[] = [],
  ) {
    super('VALIDATION_FAILED', message);
  }
}

export class OriginNotAllowedError extends DomainError {
  constructor() {
    super('ORIGIN_NOT_ALLOWED', 'Origin not allowed for state-changing requests');
  }
}

export class HttpsRequiredError extends DomainError {
  constructor() {
    super('HTTPS_REQUIRED', 'HTTPS is required');
  }
}

export class OrderNotCancellableError extends DomainError {
  constructor(message = 'Only orders in status NEW can be cancelled') {
    super('ORDER_NOT_CANCELLABLE', message);
  }
}

export class ConcurrentRequestError extends DomainError {
  constructor() {
    super('CONCURRENT_REQUEST', 'Another request for the same user is in progress; retry');
  }
}

export class IdempotencyKeyReusedError extends DomainError {
  constructor() {
    super('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used with a different request');
  }
}

export class PriceUnavailableError extends DomainError {
  constructor(instrumentId: number) {
    super('PRICE_UNAVAILABLE', `No market price available for instrument ${instrumentId}`);
  }
}

export class ZeroQuantityError extends DomainError {
  constructor() {
    super('ZERO_QUANTITY', 'The amount is not enough to buy or sell a single share');
  }
}

export class RateLimitedError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', 'Too many requests');
  }
}

export class RequestTimeoutError extends DomainError {
  constructor() {
    super('REQUEST_TIMEOUT', 'The request took too long');
  }
}
