import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { RequestTimeoutError } from '../errors';
import { requestTimeout } from './request-timeout';

function fakeRes(): Response & EventEmitter {
  const res = new EventEmitter() as Response & EventEmitter;
  Object.assign(res, { headersSent: false });
  return res;
}

describe('requestTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('pasa RequestTimeoutError si no se respondió a tiempo', () => {
    const res = fakeRes();
    const next = jest.fn();
    requestTimeout(1000)({} as Request, res, next);
    expect(next).toHaveBeenCalledWith();
    jest.advanceTimersByTime(1000);
    expect(next).toHaveBeenLastCalledWith(expect.any(RequestTimeoutError));
  });

  it('no hace nada si la respuesta terminó antes y limpia el timer', () => {
    const res = fakeRes();
    const next = jest.fn();
    requestTimeout(1000)({} as Request, res, next);
    res.emit('finish');
    jest.advanceTimersByTime(5000);
    expect(next).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('no pasa el error si los headers ya se enviaron', () => {
    const res = fakeRes();
    Object.assign(res, { headersSent: true });
    const next = jest.fn();
    requestTimeout(1000)({} as Request, res, next);
    jest.advanceTimersByTime(1000);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
