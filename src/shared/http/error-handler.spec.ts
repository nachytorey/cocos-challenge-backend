import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  ConcurrentRequestError,
  NotFoundError,
  OrderNotCancellableError,
  RateLimitedError,
} from '../errors';
import { errorHandler, statusByCode } from './error-handler';

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    contentType: '',
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    type(t: string) {
      this.contentType = t;
      return this;
    },
    set(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

const logger = { error: jest.fn(), warn: jest.fn() };
const req = { id: 'trace-123' } as unknown as Request;
const next: NextFunction = jest.fn();

function run(err: unknown) {
  const res = fakeRes();
  errorHandler(logger)(err, req, res as unknown as Response, next);
  return res;
}

describe('errorHandler', () => {
  it('los errores de dominio llevan solo code; el status sale del mapa', () => {
    const err = new NotFoundError('User 9 not found');
    expect(err).not.toHaveProperty('status');
    const res = run(err);
    expect(res.statusCode).toBe(statusByCode.NOT_FOUND);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND', detail: 'User 9 not found' });
  });

  it('usa application/problem+json e incluye traceId', () => {
    const res = run(new OrderNotCancellableError('no'));
    expect(res.contentType).toBe('application/problem+json');
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'ORDER_NOT_CANCELLABLE', traceId: 'trace-123' });
  });

  it('convierte un error de zod en 400 VALIDATION_FAILED con errors[]', () => {
    const parsed = z.object({ amount: z.string() }).safeParse({ amount: 1 });
    const res = run(parsed.error);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'amount', message: expect.any(String) as string }],
    });
  });

  it('body demasiado grande → 413 PAYLOAD_TOO_LARGE', () => {
    const res = run(Object.assign(new Error('too large'), { type: 'entity.too.large' }));
    expect(res.statusCode).toBe(413);
    expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('JSON mal formado → 400 VALIDATION_FAILED', () => {
    const res = run(Object.assign(new SyntaxError('bad'), { type: 'entity.parse.failed' }));
    expect(res.statusCode).toBe(400);
  });

  it('lock_timeout de Postgres (55P03) → 409 CONCURRENT_REQUEST', () => {
    const res = run(Object.assign(new Error('lock timeout'), { driverError: { code: '55P03' } }));
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'CONCURRENT_REQUEST' });
    expect(run(new ConcurrentRequestError()).statusCode).toBe(409);
  });

  it('error desconocido → 500 sin stack ni SQL, y se loguea', () => {
    const res = run(new Error('relation "orders" SELECT * FROM secret'));
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(res.body)).not.toMatch(/SELECT|stack|orders/);
    expect(logger.error).toHaveBeenCalled();
  });

  it('un error con `type` desconocido se trata como error inesperado', () => {
    const res = run(Object.assign(new Error('x'), { type: 'otra.cosa' }));
    expect(res.statusCode).toBe(500);
  });

  it('acepta el code de Postgres directo en el error', () => {
    expect(run(Object.assign(new Error('x'), { code: '55P03' })).statusCode).toBe(409);
  });

  it('si los headers ya se enviaron, delega en el handler por defecto de Express', () => {
    const res = { ...fakeRes(), headersSent: true };
    const nextFn = jest.fn();
    const err = new Error('late');
    errorHandler(logger)(err, req, res as unknown as Response, nextFn);
    expect(nextFn).toHaveBeenCalledWith(err);
    expect(res.statusCode).toBe(0);
  });

  it('omite traceId si el request no tiene id', () => {
    const res = fakeRes();
    errorHandler(logger)(new NotFoundError(), {} as Request, res as unknown as Response, next);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect((res.body as { traceId?: string }).traceId).toBeUndefined();
  });

  it('429 agrega Retry-After', () => {
    const res = run(new RateLimitedError(42));
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('42');
  });
});
