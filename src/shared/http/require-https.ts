import type { RequestHandler } from 'express';
import { HttpsRequiredError } from '../errors';

/**
 * En producción, todo request debe llegar por TLS (parte baseline del principio VII).
 * Detrás de un proxy, `req.secure` depende de `trust proxy` (X-Forwarded-Proto).
 */
export function requireHttps(nodeEnv: string): RequestHandler {
  return (req, _res, next) => {
    if (nodeEnv === 'production' && !req.secure) {
      next(new HttpsRequiredError());
      return;
    }
    next();
  };
}
