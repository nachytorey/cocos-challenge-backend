import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import {
  DomainError,
  RateLimitedError,
  ValidationFailedError,
  type ErrorCode,
  type FieldError,
} from '../errors';

/** Único lugar donde un código de error se traduce a status HTTP. */
export const statusByCode: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  ORIGIN_NOT_ALLOWED: 403,
  HTTPS_REQUIRED: 403,
  NOT_FOUND: 404,
  ORDER_NOT_CANCELLABLE: 409,
  CONCURRENT_REQUEST: 409,
  PAYLOAD_TOO_LARGE: 413,
  IDEMPOTENCY_KEY_REUSED: 422,
  PRICE_UNAVAILABLE: 422,
  ZERO_QUANTITY: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  REQUEST_TIMEOUT: 503,
};

const titleByCode: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Validation failed',
  ORIGIN_NOT_ALLOWED: 'Origin not allowed',
  HTTPS_REQUIRED: 'HTTPS required',
  NOT_FOUND: 'Not found',
  ORDER_NOT_CANCELLABLE: 'Order not cancellable',
  CONCURRENT_REQUEST: 'Concurrent request',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  IDEMPOTENCY_KEY_REUSED: 'Idempotency key reused',
  PRICE_UNAVAILABLE: 'Price unavailable',
  ZERO_QUANTITY: 'Zero quantity',
  RATE_LIMITED: 'Too many requests',
  INTERNAL_ERROR: 'Internal error',
  REQUEST_TIMEOUT: 'Request timeout',
};

interface Problem {
  code: ErrorCode;
  detail: string;
  errors?: FieldError[];
  retryAfterSeconds?: number;
}

interface ErrorLogger {
  error(obj: object, msg?: string): void;
}

const LOCK_NOT_AVAILABLE = '55P03';
/**
 * Errores de datos de Postgres (clase 22) que provoca un valor del cliente que la validación no
 * detuvo: fuera de rango (22003), carácter no representable (22021) o sintaxis inválida (22P02).
 * Red de seguridad: se informan como 400 sin exponer el mensaje de la base.
 */
const DATA_EXCEPTION_CODES = new Set(['22003', '22021', '22P02']);

function hasProp<K extends string>(value: unknown, key: K): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && key in value;
}

function postgresCode(err: unknown): unknown {
  if (hasProp(err, 'driverError') && hasProp(err.driverError, 'code')) return err.driverError.code;
  return hasProp(err, 'code') ? err.code : undefined;
}

function fromZod(err: ZodError): Problem {
  const errors = err.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
  return { code: 'VALIDATION_FAILED', detail: 'The request is invalid', errors };
}

function fromDomain(err: DomainError): Problem {
  const problem: Problem = { code: err.code, detail: err.message };
  if (err instanceof ValidationFailedError && err.errors.length > 0) problem.errors = err.errors;
  if (err instanceof RateLimitedError) problem.retryAfterSeconds = err.retryAfterSeconds;
  return problem;
}

function fromBodyParser(type: unknown): Problem | undefined {
  if (type === 'entity.too.large') {
    return { code: 'PAYLOAD_TOO_LARGE', detail: 'The request body is too large' };
  }
  if (type === 'entity.parse.failed') {
    return { code: 'VALIDATION_FAILED', detail: 'The request body is not valid JSON' };
  }
  return undefined;
}

function toProblem(err: unknown): Problem | undefined {
  if (err instanceof ZodError) return fromZod(err);
  if (err instanceof DomainError) return fromDomain(err);
  const bodyProblem = hasProp(err, 'type') ? fromBodyParser(err.type) : undefined;
  if (bodyProblem) return bodyProblem;
  const pgCode = postgresCode(err);
  if (pgCode === LOCK_NOT_AVAILABLE) {
    return {
      code: 'CONCURRENT_REQUEST',
      detail: 'Another request for the same user is in progress; retry',
    };
  }
  if (typeof pgCode === 'string' && DATA_EXCEPTION_CODES.has(pgCode)) {
    return {
      code: 'VALIDATION_FAILED',
      detail: 'The request contains a value that cannot be processed',
    };
  }
  return undefined;
}

function traceIdOf(id: unknown): string | undefined {
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
}

/** Convierte cualquier error en Problem Details (RFC 9457) con un `code` estable. */
export function errorHandler(logger: ErrorLogger): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const problem = toProblem(err) ?? { code: 'INTERNAL_ERROR', detail: 'Unexpected error' };
    const status = statusByCode[problem.code];
    const traceId = traceIdOf(req.id);
    if (status >= 500) logger.error({ err, traceId }, 'request failed');
    if (problem.retryAfterSeconds !== undefined) {
      res.set('Retry-After', String(problem.retryAfterSeconds));
    }
    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `urn:problem:${problem.code.toLowerCase()}`,
        title: titleByCode[problem.code],
        status,
        code: problem.code,
        detail: problem.detail,
        ...(problem.errors ? { errors: problem.errors } : {}),
        traceId,
      });
  };
}
