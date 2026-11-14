import type { Request, Response } from 'express';
import { HttpsRequiredError } from '../errors';
import { requireHttps } from './require-https';

function run(nodeEnv: string, secure: boolean) {
  const next = jest.fn();
  requireHttps(nodeEnv)({ secure } as Request, {} as Response, next);
  return next;
}

describe('requireHttps', () => {
  it('en producción rechaza requests sin TLS', () => {
    expect(run('production', false)).toHaveBeenCalledWith(expect.any(HttpsRequiredError));
  });

  it('en producción deja pasar requests con TLS', () => {
    expect(run('production', true)).toHaveBeenCalledWith();
  });

  it.each(['development', 'test'])('en %s deja pasar siempre', (env) => {
    expect(run(env, false)).toHaveBeenCalledWith();
  });
});
