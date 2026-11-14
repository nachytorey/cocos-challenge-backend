# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Backend del challenge de Cocos: API REST de portfolio, búsqueda de activos y envío de órdenes. Express 5 + TypeScript + PostgreSQL (TypeORM), como pide el enunciado (`.challenge/fullstack-challenge.md`). Datos iniciales en `.challenge/database.sql`.
Sin frontend: el enunciado solo pide la API. Los clientes son `requests.http` (REST Client de VS Code) y Swagger UI (`/docs`, `/docs-json`).

## Reglas

Las reglas no negociables están en `.specify/memory/constitution.md`. Leerla antes de planificar o implementar.

## Comandos

Requiere Node >= 24 y PostgreSQL (`docker compose up -d postgres`, o el `docker run` equivalente del README si falta el plugin de Compose). Copiar `.env.example` a `.env`.

```bash
npm run dev                 # tsx watch, http://localhost:3000
npm run build && npm start  # producción (NODE_ENV=production no carga .env)
npm run migration:run       # idempotency_keys; la baseline es un no-op

npm run lint && npm run typecheck && npm run check:cycles   # compuertas estáticas (madge detecta ciclos)
npm test                    # unit (src/**/*.spec.ts) con umbral de cobertura 80% líneas y ramas
npm run test:functional     # HTTP con Supertest contra la base cocos_test (requiere DATABASE_URL_TEST)
npm run test:load           # smoke k6 (API levantada)
npm run format              # prettier --write .

npx jest --selectProjects unit src/orders/orders.service.spec.ts          # un archivo unit
npx jest --selectProjects functional test/orders.functional.spec.ts -t "LIMIT"   # un funcional por nombre
```

Los tests funcionales no corren en paralelo (`--runInBand`) porque comparten la base: cada uno hace `resetDb` + `loadChallengeSeed` (`test/helpers/db.ts`).

Husky: `pre-commit` corre lint-staged (eslint `--fix` sin warnings + prettier) y typecheck; `pre-push` corre `check:cycles` y `npm test`. Los funcionales y la auditoría los corre solo el CI (`.github/workflows/ci.yml`).

## Arquitectura

- **Composition root único**: `src/app.ts` arma repositorios → services → controllers → routers por constructor (`v1Router`) y el stack de middlewares de `createApp`. No hay contenedor de DI ni singletons. Los tests funcionales usan la app real con `buildTestApp()` (`test/helpers/test-app.ts`), sin levantar el servidor.
- **Orden de middlewares** (importa): helmet → pino-http (request id) → requireHttps → cors → json → originCheck → rate limit global → timeout → health → openapi → `/v1` → 404 → `errorHandler`. `POST /v1/orders` y las cancelaciones tienen además un limiter más estricto.
- **Estructura por feature** (`orders/`, `portfolio/`, `instruments/`, `holdings/`, `market-data/`, `users/`): `*.routes` → `*.controller` → `*.service` → `*.repository`, con schemas zod en `*.schemas.ts` que alimentan validación y OpenAPI a la vez. Los services reciben sus dependencias como `Pick<Repo, ...>` para poder doblarlas en los unit tests.
- **Saldos y posiciones no se guardan**: se derivan siempre de la tabla `orders` con la función pura `computeHoldings` (`src/holdings/`). Las órdenes `NEW` reservan pesos o acciones. Cambiar reglas de dinero casi siempre implica tocar ahí y no en SQL.
- **Órdenes**: MARKET y LIMIT son estrategias (`orders/order-type.strategy.ts`). Cada envío o cancelación corre en una transacción que bloquea la fila del usuario (`SELECT ... FOR UPDATE`), lo que serializa las órdenes de un mismo usuario. La `Idempotency-Key` se guarda en la misma transacción con el hash del body.
- **Dinero**: `decimal.js` (`shared/money.ts`); los importes salen como string decimal con moneda. Nunca `number` para plata.
- **Errores**: jerarquía en `shared/errors.ts` + `shared/http/error-handler.ts`, respuesta Problem Details con `code` estable. Lanzar errores de ese catálogo, no armar respuestas a mano.
- **Config**: `src/config.ts` es la única lectura de `process.env`, validada con zod al arrancar (fail fast). Los tests usan `loadConfig`/`testConfig`, no `getConfig`.
- **Esquema heredado**: `database.sql` se respeta (migración baseline no-op); columnas en minúscula (`instrumentid`, `previousclose`) y `orders.datetime` sin zona, siempre en UTC.
- **Decoradores de TypeORM**: dependen de `emitDecoratorMetadata`, por eso las entidades solo se cargan con ts-jest/tsx/tsc (los transpiladores basados en Babel, como el de Playwright, fallan).

## Flujo (Spec Kit)

constitution → `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`

Siempre correr `/speckit-analyze` antes de `/speckit-implement`. Specs, plan y tareas de la feature actual en `specs/001-portfolio-orders-api/`.

## Skills de proyecto

- `express-conventions`: estructura por feature, capas, composition root, zod y OpenAPI.
- `typeorm-postgres`: entidades, migraciones, transacciones, numeric.
- `testing-conventions`: test-first con Jest y Supertest (unit y funcionales HTTP).
- `auth-cookies`: token de sesión en cookie HttpOnly, logout y CORS.
- `api-resilience`: idempotencia, reintentos, circuit breaker y Swagger obligatorio.
- `payments-saga-outbox`: idempotencia en pagos, sagas con compensaciones y outbox.
- `rate-limiting`: express-rate-limit global (Redis si hay varias instancias), límites estrictos en rutas sensibles y 429.
- `error-contract`: formato único de errores (Problem Details) y catálogo de códigos.
- `observability`: logs estructurados, correlation id, health checks y métricas.
- `docker-ci`: Dockerfile, compose con Postgres/Redis y pipeline de CI.
- `db-seeding-fixtures`: seeds, factories y datos de volumen para tests de carga.
- `api-conventions`: recursos, status codes, paginación, orden, filtros, fechas y montos.
- `app-security`: CSRF, argon2, modelo de autorización, límites y auditoría de dependencias.
- `runtime-robustness`: graceful shutdown, timeouts, validación de config al arrancar.
- `code-smells`: catálogo de smells, corrección y regla automática que los atrapa.
- `simplicity-first`: checklist para detectar sobreingeniería y disparadores para crecer.
- `design-patterns`: elegir, nombrar y justificar un patrón de diseño por feature.
- `concurrency-and-load`: locking, escala (miles de RPS) y tests de stress con k6.
- `git-hooks-husky`: Husky + lint-staged (pre-commit lint/prettier/typecheck, pre-push tests) y su relación con el CI.
