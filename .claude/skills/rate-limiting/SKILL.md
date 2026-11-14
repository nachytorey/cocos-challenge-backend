---
name: rate-limiting
description: Rate limiting global y por ruta con express-rate-limit (y Redis si hay varias instancias), respuestas 429 y su documentación en OpenAPI. Usar al crear rutas sensibles (login, refresh, órdenes, verificaciones) o al configurar la protección contra abuso.
---

# Rate limiting

Implementa el principio XII de la constitution.

## Global por defecto

```ts
import { rateLimit } from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  standardHeaders: 'draft-8', // RateLimit + Retry-After
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new RateLimitedError()), // pasa por el error handler
});

app.use(globalLimiter);
```

- Una sola instancia: el store en memoria alcanza.
- Varias instancias: store compartido (`rate-limit-redis`); en memoria cada instancia contaría por separado.
- Detrás de un proxy: `app.set('trust proxy', 1)` para limitar por IP real.
- Si hay autenticación, limitar por usuario (`keyGenerator`); si no, por IP.

## Límites más estrictos en rutas sensibles

**Condicional.** El limiter global es la base. Un segundo limiter por ruta se agrega solo si el spec declara una necesidad de abuso (login, verificación de códigos, una operación con costo real). Sin ese requisito, un solo limiter global alcanza (ver `simplicity-first` y `consigna-first`).

```ts
const ordersLimiter = rateLimit({ windowMs: 60_000, limit: 30 });
router.post('/orders', ordersLimiter, validate(...), controller.create);
```

Aplicar a: login, refresh de token, operaciones no repetibles (órdenes, pagos), verificación de códigos.

## Respuesta

- `429 Too Many Requests` con `Retry-After`, en formato Problem Details (`code: RATE_LIMITED`).
- Documentar el 429 en OpenAPI en cada ruta.
- Excluir una ruta del limiter (p. ej. health checks) solo con justificación en el plan.

## Variables de entorno (agregar a `.env.example`)

`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` (y `REDIS_URL` si se usa Redis).

## Tests

- Funcional: superar el límite devuelve `429` con `Retry-After`.
- Funcional: la ruta sensible tiene un límite más estricto que el global.
