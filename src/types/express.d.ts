import 'pino-http';
import type { RateLimitInfo } from 'express-rate-limit';

declare global {
  namespace Express {
    interface Request {
      /** Estado del rate limit para este request; lo agrega `express-rate-limit`. */
      rateLimit?: RateLimitInfo;
      /** Valores ya parseados por el middleware `validate` (body, query, params, headers). */
      validated?: Partial<Record<'body' | 'query' | 'params' | 'headers', unknown>>;
    }
  }
}

export {};
