import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

const PARTS = ['body', 'query', 'params', 'headers'] as const;

/** Query de las rutas que no reciben parámetros: cualquier parámetro se rechaza (principio III). */
export const NoQuery = z.object({}).strict();
type Part = (typeof PARTS)[number];

export type Schemas = Partial<Record<Part, z.ZodType>>;

export type Validated<S extends Schemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

/** Valida las partes declaradas del request y deja los valores parseados en `req.validated`. */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const validated: Partial<Record<Part, unknown>> = {};
    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        next(result.error);
        return;
      }
      validated[part] = result.data;
    }
    req.validated = validated;
    next();
  };
}

/**
 * Devuelve `req.validated` tipado según los mismos schemas usados en `validate`.
 * Es el único cast de la capa HTTP: el middleware ya garantizó la forma de los datos.
 */
export function getValidated<S extends Schemas>(req: Request, _schemas: S): Validated<S> {
  return (req.validated ?? {}) as Validated<S>;
}
