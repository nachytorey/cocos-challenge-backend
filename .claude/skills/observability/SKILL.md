---
name: observability
description: Logs estructurados con correlation id, health checks, métricas básicas y trazabilidad para diagnosticar carga, breakers y errores. Usar al configurar logging, agregar /health, métricas o al depurar problemas de rendimiento y resiliencia.
---

# Observability

Sin esto no se pueden diagnosticar los tests de carga, los breakers ni los reintentos.

## Logs estructurados

- Logs en JSON con `pino` y `pino-http`, un evento por línea, con nivel, timestamp, mensaje y contexto.
- **Correlation id** por request: leer `X-Request-Id` o generarlo, guardarlo en `AsyncLocalStorage`, incluirlo en cada log y devolverlo como `traceId` en errores (ver `error-contract`).
- Nunca loguear tokens, cookies, contraseñas, datos de tarjeta ni datos personales; configurar `redact` para esos campos.
- Niveles: `error` (requiere acción), `warn` (degradación: breaker abierto, reintento), `info` (eventos de negocio), `debug` (solo en desarrollo).
- Loguear cambios de estado del circuit breaker y los reintentos con su número de intento.

## Health checks

Dos rutas simples, sin librería extra:

- `GET /health/live`: el proceso responde (liveness).
- `GET /health/ready`: Postgres (y Redis si se usa) responden (readiness).
- Rutas `@Public()` y excluidas del rate limit; sin información sensible.

## Métricas

- Exponer `/metrics` (Prometheus, `prom-client`) protegido o solo en red interna.
- Mínimo: RPS, latencia p50/p95/p99 por ruta, tasa de errores por status, tamaño del pool de conexiones, estado de breakers, tamaño de la cola del outbox.
- Estas métricas son las que se comparan con los thresholds de los tests de k6.

## Trazas

- Propagar el correlation id a las llamadas salientes (`X-Request-Id`).
- OpenTelemetry solo cuando haya varios servicios que lo justifiquen (principio V).

## Tests

- e2e: una respuesta de error incluye `traceId` y el mismo id aparece en el log.
- e2e: `/health/ready` devuelve `503` si la base de datos no responde.
- Verificar que los logs no contienen el token ni campos redactados.
