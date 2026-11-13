---
name: api-resilience
description: Reintentos, idempotencia, timeouts y circuit breaker para APIs y llamadas a servicios externos, más la documentación Swagger obligatoria de cada endpoint. Usar al crear endpoints, integrar servicios externos o tocar el manejo de errores.
---

# API resilience + Swagger

Implementa los principios VI y VIII de la constitution.

## Endpoints seguros para reintentar (idempotencia)

- `GET`, `PUT`, `DELETE`: idempotentes por diseño; repetirlos no cambia el resultado.
- `POST` cuya repetición causa daño (mover dinero, crear una orden, enviar una notificación): `Idempotency-Key` **obligatoria**. La regla y la implementación viven en un solo lugar: principio IX y skill `payments-saga-outbox`.
- `POST` sin efecto dañino al repetirse: no necesita clave.
- Documentar el header en OpenAPI como parámetro requerido de la ruta (schema zod de headers registrado en el registry).

## Llamadas a servicios externos

Aplica solo si la feature llama a un servicio externo. Toda llamada saliente lleva las tres cosas:

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
- Los parámetros (timeout, intentos, umbral, cooldown) vienen de `config.ts`, no hardcodeados.

## Swagger obligatorio en TODO endpoint

Un endpoint sin documentar no se mergea. Cada uno lleva:

- `registry.registerPath` con `tags`, `summary` y `description`.
- Schemas zod de request y response (los mismos de la validación), con `.openapi({ description, example })` en cada campo.
- Una respuesta por cada código posible: 2xx, 400, 401/403 si aplica, 404, 409, 422, 429, 503.
- Esquema de seguridad (cookie) en rutas protegidas, si la API autentica.
- Ejemplos (`example`) en los campos no obvios.

## Tests

- Unit: la política de retry reintenta ante fallo transitorio y NO reintenta ante 4xx; el breaker abre tras el umbral y falla rápido.
- e2e: un `POST` repetido con la misma `Idempotency-Key` no duplica el efecto; con el servicio externo caído responde `503` con `Retry-After`.
- Verificar que el documento OpenAPI generado incluye el endpoint nuevo.
