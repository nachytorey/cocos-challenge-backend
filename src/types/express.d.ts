import 'pino-http';

declare global {
  namespace Express {
    interface Request {
      /** Valores ya parseados por el middleware `validate` (body, query, params, headers). */
      validated?: Partial<Record<'body' | 'query' | 'params' | 'headers', unknown>>;
    }
  }
}

export {};
