---
name: rate-limiting
description: Rate limiting global y por ruta con @nestjs/throttler y Redis, respuestas 429 y su documentación en Swagger. Usar al crear endpoints sensibles (login, refresh, pagos, verificaciones) o al configurar la protección contra abuso.
---

# Rate limiting

Implementa el principio XII de la constitution.

## Global por defecto

```ts
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => ({
    throttlers: [{ ttl: cfg.get('RATE_LIMIT_TTL_MS'), limit: cfg.get('RATE_LIMIT_MAX') }],
    storage: new ThrottlerStorageRedisService(cfg.get('REDIS_URL')), // compartido entre instancias
  }),
}),
// y registrar ThrottlerGuard como APP_GUARD
```

- Con varias instancias el store DEBE ser compartido (Redis); en memoria cada instancia contaría por separado.
- Detrás de un proxy: `app.set('trust proxy', 1)` para limitar por IP real.
- Mejor limitar por usuario autenticado cuando exista, y por IP en rutas públicas.

## Límites más estrictos en rutas sensibles

```ts
@Throttle({ default: { limit: 5, ttl: 60_000 } }) // p. ej. login
```

Aplicar a: login, refresh de token, pagos/transferencias, verificación de códigos, recuperación de contraseña.

## Respuesta

- `429 Too Many Requests` con header `Retry-After`.
- Documentar en Swagger: `@ApiResponse({ status: 429, description: 'Rate limit exceeded' })`.
- Salir del límite con `@SkipThrottle()` solo con justificación escrita en el plan.

## Variables de entorno (agregar a `.env.example`)

`RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX`, `REDIS_URL`.

## Tests

- e2e: superar el límite devuelve `429` con `Retry-After`; pasada la ventana vuelve a responder.
- e2e: la ruta de login tiene un límite más estricto que el global.
- Con carga (k6): el limiter no degrada la latencia p95 del camino normal.
