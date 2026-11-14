import type { RequestHandler } from 'express';
import { OriginNotAllowedError } from '../errors';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Rechaza requests que cambian estado desde un Origin no permitido (principio XVI). */
export function originCheck(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (STATE_CHANGING.has(req.method) && origin !== undefined && !allowed.has(origin)) {
      next(new OriginNotAllowedError());
      return;
    }
    next();
  };
}
