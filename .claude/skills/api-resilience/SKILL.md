---
name: api-resilience
description: Reintentos, idempotencia, timeouts y circuit breaker para APIs y llamadas a servicios externos, más la documentación Swagger obligatoria de cada endpoint. Usar al crear endpoints, integrar servicios externos o tocar el manejo de errores.
---

# API resilience + Swagger

Implementa los principios VI y VIII de la constitution.

## Endpoints seguros para reintentar (idempotencia)

- `GET`, `PUT`, `DELETE`: idempotentes por diseño; repetirlos no cambia el resultado.
- `POST` que crea o cobra algo: aceptar header `Idempotency-Key`. Guardar la clave con el resultado (tabla con índice único); si llega repetida, devolver la respuesta original sin reejecutar.
- Documentar el header en Swagger con `@ApiHeader({ name: 'Idempotency-Key', required: true })`.

## Llamadas a servicios externos

Toda llamada saliente lleva las tres cosas:

1. **Timeout explícito** (nunca el default infinito).
2. **Reintentos acotados**: máx. 3, backoff exponencial con jitter, solo ante fallos transitorios (timeout, 502/503/504, errores de red) y solo si la llamada es idempotente. Nunca reintentar 4xx.
3. **Circuit breaker**: abre tras N fallos consecutivos o un porcentaje de error, falla rápido mientras está abierto, prueba en half-open tras un cooldown.

Librerías sugeridas: `cockatiel` (retry + breaker + timeout componibles) u `opossum` (breaker). Elegir una y envolver el cliente en un único provider para no repetir la política:

```ts
// cockatiel: retry(3, exp backoff) envuelto por circuitBreaker
const policy = wrap(retry, breaker, timeout);
return policy.execute(() => this.http.get(url));
```

- Breaker abierto → responder `503 Service Unavailable` con header `Retry-After`; registrar con `Logger` cada cambio de estado (open / half-open / closed).
- Los parámetros (timeout, intentos, umbral, cooldown) vienen de `@nestjs/config`, no hardcodeados.

## Swagger obligatorio en TODO endpoint

Un endpoint sin documentar no se mergea. Cada uno lleva:

- `@ApiTags`, `@ApiOperation({ summary })`.
- DTOs de request y response con `@ApiProperty` en cada campo.
- `@ApiResponse` para cada código posible: 2xx, 400, 401/403 si aplica, 404, 409, 503.
- Autenticación (`@ApiCookieAuth()` para el token en cookie) en rutas protegidas.
- Ejemplos (`example`) en los campos no obvios.

## Tests

- Unit: la política de retry reintenta ante fallo transitorio y NO reintenta ante 4xx; el breaker abre tras el umbral y falla rápido.
- e2e: un `POST` repetido con la misma `Idempotency-Key` no duplica el efecto; con el servicio externo caído responde `503` con `Retry-After`.
- Verificar que el documento OpenAPI generado incluye el endpoint nuevo.
