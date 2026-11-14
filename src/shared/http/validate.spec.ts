import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { getValidated, validate } from './validate';

function makeReq(parts: Partial<Request>): Request {
  return { body: {}, query: {}, params: {}, headers: {}, ...parts } as Request;
}

describe('validate', () => {
  const schemas = {
    body: z.object({ quantity: z.number().int() }).strict(),
    query: z.object({ limit: z.coerce.number().int() }),
    params: z.object({ id: z.coerce.number().int() }),
    headers: z.object({ 'idempotency-key': z.string() }),
  };

  it('deja en req.validated los valores parseados de body, query, params y headers', () => {
    const req = makeReq({
      body: { quantity: 3 },
      query: { limit: '5' },
      params: { id: '7' },
      headers: { 'idempotency-key': 'abc', host: 'x' },
    });
    const next = jest.fn();
    validate(schemas)(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.validated).toEqual({
      body: { quantity: 3 },
      query: { limit: 5 },
      params: { id: 7 },
      headers: { 'idempotency-key': 'abc' },
    });
  });

  it('un campo desconocido con .strict() produce un error de validación', () => {
    const req = makeReq({
      body: { quantity: 3, extra: true },
      query: { limit: '5' },
      params: { id: '7' },
      headers: { 'idempotency-key': 'abc' },
    });
    const next = jest.fn();
    validate(schemas)(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
  });

  it('getValidated devuelve los valores parseados (o vacío si no se validó)', () => {
    const req = makeReq({ query: { limit: '9' } });
    validate({ query: schemas.query })(req, {} as Response, jest.fn());
    expect(getValidated(req, { query: schemas.query }).query.limit).toBe(9);
    expect(getValidated(makeReq({}), { query: schemas.query })).toEqual({});
  });

  it('valida solo las partes declaradas', () => {
    const req = makeReq({ query: { limit: '9' } });
    const next = jest.fn();
    validate({ query: schemas.query })(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.validated).toEqual({ query: { limit: 9 } });
  });
});
