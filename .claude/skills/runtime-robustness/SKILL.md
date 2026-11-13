---
name: runtime-robustness
description: Graceful shutdown, timeouts de request, validación de configuración al arrancar y manejo de errores no capturados en NestJS. Usar al escribir main.ts, configurar el arranque, el módulo de config, o al preparar el servicio para deploys y reinicios.
---

# Runtime robustness

Implementa el principio XVII: el servicio arranca, se detiene y falla de forma predecible.

## Arranque: validar configuración (fail fast)

- Esquema de validación para las variables de entorno en `ConfigModule.forRoot({ validate })` (con `class-validator`, o Joi/zod si el plan lo justifica).
- Variable requerida ausente o inválida → el proceso no arranca y muestra cuál falta.
- Acceso a config siempre tipado vía `ConfigService`, nunca `process.env` suelto en el código.

## Graceful shutdown

```ts
app.enableShutdownHooks(); // SIGTERM / SIGINT
```

- Al recibir la señal: dejar de aceptar requests nuevos, terminar los que están en curso dentro de un tiempo máximo (`SHUTDOWN_TIMEOUT_MS`), cerrar conexiones (DB, Redis, broker) en `onApplicationShutdown`.
- El health check de readiness pasa a "no listo" al iniciar el apagado, para que el balanceador deje de enviar tráfico.
- Workers y relays (outbox) terminan el lote actual y no toman otro.

## Timeouts

- Timeout de request en el servidor (interceptor global con `timeout()` de RxJS o `server.requestTimeout`); al vencer → `503`/`504` con el formato de `error-contract`.
- Base de datos: `statement_timeout`, `lock_timeout` e `idle_in_transaction_session_timeout` (ver `typeorm-postgres`).
- Llamadas salientes: timeout explícito siempre (ver `api-resilience`).
- Regla: el timeout interno es menor que el externo (query < request < balanceador), para que el error se origine en el punto más cercano a la causa.

## Errores no capturados

```ts
process.on('unhandledRejection', (e) => { logger.error(e); process.exit(1); });
process.on('uncaughtException', (e) => { logger.error(e); process.exit(1); });
```

Se loguea y el proceso termina; el orquestador lo reinicia limpio. No seguir sirviendo en estado desconocido.

## Variables de entorno (agregar a `.env.example`)

`SHUTDOWN_TIMEOUT_MS`, `REQUEST_TIMEOUT_MS`.

## Tests

- Unit: la validación de config rechaza una variable faltante y una con formato inválido.
- e2e: un request que supera el timeout devuelve el error del contrato y no queda colgado.
- e2e: tras la señal de apagado, un request en curso termina bien y `/health/ready` responde no listo.
