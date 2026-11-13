---
name: runtime-robustness
description: Graceful shutdown, timeouts de request, validación de configuración al arrancar y manejo de errores no capturados en Express. Usar al escribir server.ts, config.ts, el arranque, o al preparar el servicio para deploys y reinicios.
---

# Runtime robustness

Implementa el principio XVII: el servicio arranca, se detiene y falla de forma predecible.

## Arranque: validar configuración (fail fast)

```ts
// config.ts — única lectura de process.env
const Env = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().default(3000),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});
const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  process.stderr.write(`Invalid configuration:\n${z.prettifyError(parsed.error)}\n`);
  process.exit(1);
}
export const config = parsed.data;
```

Se escribe a `process.stderr` porque el logger todavía no existe y `console` está prohibido (principio XIV).

## Graceful shutdown

```ts
const server = app.listen(config.port);
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    markNotReady();                      // /health/ready responde 503
    server.close(async () => {           // deja terminar los requests en curso
      await dataSource.destroy();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), config.shutdownTimeoutMs).unref();
  });
}
```

- Workers o relays terminan el lote actual y no toman otro.

## Timeouts

- Servidor: `server.requestTimeout` y `server.headersTimeout`; además un middleware que corta el request al vencer `REQUEST_TIMEOUT_MS` con `503` en formato `error-contract`.
- Base de datos: `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout` (ver `typeorm-postgres`).
- Llamadas salientes: timeout explícito siempre (ver `api-resilience`).
- Regla: el timeout interno es menor que el externo (query < request < balanceador).

## Errores no capturados

```ts
process.on('unhandledRejection', (e) => { logger.fatal(e); process.exit(1); });
process.on('uncaughtException', (e) => { logger.fatal(e); process.exit(1); });
```

## Variables de entorno (agregar a `.env.example`)

`SHUTDOWN_TIMEOUT_MS`, `REQUEST_TIMEOUT_MS`.

## Tests

- Unit: la validación de config rechaza una variable faltante y una con formato inválido.
- Funcional: un request que supera el timeout devuelve el error del contrato.
