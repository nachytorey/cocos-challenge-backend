import type { Request, Response } from 'express';
import { OriginNotAllowedError } from '../errors';
import { originCheck } from './origin-check';

const check = originCheck(['https://app.example.com']);

function run(method: string, origin?: string) {
  const next = jest.fn();
  const req = { method, headers: origin ? { origin } : {} } as Request;
  check(req, {} as Response, next);
  return next;
}

describe('originCheck', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s con Origin no permitido → error', (method) => {
    expect(run(method, 'https://evil.com')).toHaveBeenCalledWith(expect.any(OriginNotAllowedError));
  });

  it('deja pasar un origen permitido', () => {
    expect(run('POST', 'https://app.example.com')).toHaveBeenCalledWith();
  });

  it('deja pasar requests sin Origin (clientes no navegador)', () => {
    expect(run('POST')).toHaveBeenCalledWith();
  });

  it('no verifica GET', () => {
    expect(run('GET', 'https://evil.com')).toHaveBeenCalledWith();
  });
});
