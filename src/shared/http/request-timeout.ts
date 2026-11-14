import type { RequestHandler } from 'express';
import { RequestTimeoutError } from '../errors';

/** Ningún request espera indefinidamente (principio XVII). */
export function requestTimeout(ms: number): RequestHandler {
  return (_req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) next(new RequestTimeoutError());
    }, ms);
    const clear = () => clearTimeout(timer);
    res.once('finish', clear);
    res.once('close', clear);
    next();
  };
}
