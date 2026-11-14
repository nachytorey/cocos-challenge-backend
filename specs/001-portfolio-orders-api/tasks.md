---

description: "Task list for feature 001: portfolio, búsqueda de activos y envío de órdenes"
---

# Tasks: Portfolio, búsqueda de activos y envío de órdenes

**Input**: Design documents from `specs/001-portfolio-orders-api/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml), [quickstart.md](quickstart.md)

**Tests**: INCLUIDOS. La constitution exige test-first (principio I, NON-NEGOTIABLE) y el enunciado pide un test funcional del envío de órdenes. En cada fase, los tests se escriben primero y deben FALLAR antes de implementar; eso incluye la infraestructura de la fase 2.

**Organization**: tareas agrupadas por historia de usuario para implementarlas y probarlas por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1–US4)
- Rutas relativas a la raíz del repo (proyecto único de backend)

## Referencias rápidas

- Skills a cargar al implementar: `express-conventions`, `testing-conventions`, `typeorm-postgres`, `error-contract`, `api-conventions`, `payments-saga-outbox` (solo la parte de idempotencia), `concurrency-and-load`, `rate-limiting`, `runtime-robustness`, `observability`, `app-security`, `code-smells`.
- Valores esperados del usuario 1 (de `database.sql`): `availableCash` `627500.00`, `reservedCash` `125500.00`, `totalAccountValue` `904784.00` (ver [data-model.md](data-model.md#ejemplo-verificable-usuario-1-de-databasesql)).
- Mapa `code → status` del middleware de errores: `VALIDATION_FAILED` 400 · `ORIGIN_NOT_ALLOWED` 403 · `HTTPS_REQUIRED` 403 · `NOT_FOUND` 404 · `ORDER_NOT_CANCELLABLE` 409 · `CONCURRENT_REQUEST` 409 · `PAYLOAD_TOO_LARGE` 413 · `IDEMPOTENCY_KEY_REUSED` 422 · `PRICE_UNAVAILABLE` 422 · `ZERO_QUANTITY` 422 · `RATE_LIMITED` 429 · `INTERNAL_ERROR` 500 · `REQUEST_TIMEOUT` 503.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: proyecto inicializado, con compuertas de calidad y base de datos local.

- [X] T001 Crear `package.json` con `npm init -y`, `"type": "commonjs"`, `"engines": { "node": ">=24" }` y los scripts `dev` (`tsx watch src/server.ts`), `build` (`tsc -p tsconfig.build.json`), `start` (`node dist/server.js`), `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `format` (`prettier --write .`), `check:cycles` (`madge --circular --extensions ts src`), `test` (`jest --selectProjects unit --coverage`), `test:functional` (`jest --selectProjects functional --runInBand`), `test:load` (`k6 run test/load/portfolio-search.k6.js`), `migration:run` (`typeorm-ts-node-commonjs migration:run -d src/data-source.ts`) y `migration:revert` (`typeorm-ts-node-commonjs migration:revert -d src/data-source.ts`)
- [X] T002 Instalar dependencias de runtime con versiones exactas (`npm install --save-exact`): `express@5` `typeorm@0.3` `pg` `reflect-metadata` `zod@4` `@asteasolutions/zod-to-openapi` `swagger-ui-express` `decimal.js` `pino` `pino-http` `helmet` `cors` `express-rate-limit` `dotenv`; y de desarrollo: `typescript` `ts-node` `tsx` `@types/node` `@types/express` `@types/cors` `@types/swagger-ui-express` `jest@30` `ts-jest` `@types/jest` `supertest` `@types/supertest` `yaml` `eslint@9` `typescript-eslint` `eslint-plugin-import` `eslint-import-resolver-typescript` `eslint-plugin-jest` `prettier` `madge`; commitear `package-lock.json`. `k6` es un binario aparte: documentar su instalación en el README (T084)
- [X] T003 [P] Crear `tsconfig.json` con `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `experimentalDecorators`, `emitDecoratorMetadata`, `target` ES2023, `module` commonjs, `outDir` `dist`; y `tsconfig.build.json` que excluye `**/*.spec.ts` y `test/`
- [X] T004 [P] Crear `eslint.config.mjs` con `typescript-eslint` type-checked y las reglas del skill `code-smells`: `no-floating-promises`, `no-misused-promises`, `no-explicit-any`, `no-unused-vars` en `error`; `no-console` y `no-empty` en `error`; `complexity` 10; `max-lines-per-function` 50; `max-params` 4; `max-depth` 3; `import/no-cycle` en `error`; `eslint-plugin-jest` (`jest/expect-expect`) para los tests; `ignores`: `dist/`, `coverage/`, `node_modules/`, `test/load/`
- [X] T005 [P] Crear `.prettierrc` (single quotes, trailing commas, printWidth 100) y `.prettierignore` (`dist`, `coverage`, `node_modules`, `specs`, `package-lock.json`)
- [X] T006 [P] Crear `jest.config.ts` con dos proyectos: `unit` (`src/**/*.spec.ts`) y `functional` (`test/**/*.functional.spec.ts`, `testTimeout` 30000). La cobertura mide **solo la lógica de negocio** (principio XV): `collectCoverageFrom` = `src/**/*.service.ts`, `src/holdings/compute-holdings.ts`, `src/orders/order-type.strategy.ts`, `src/config.ts`, `src/shared/**/*.ts` excepto `src/shared/logger.ts` y `src/shared/http/openapi.ts`; `coverageThreshold.global` `{ lines: 80, branches: 80 }`
- [X] T007 [P] Crear `docker-compose.yml` con un servicio `postgres:16` con healthcheck `pg_isready`, volumen nombrado, puerto 5432, y montajes en `/docker-entrypoint-initdb.d/`: `database.sql` (base `cocos`) y `docker/init-test-db.sql`
- [X] T008 [P] Crear `docker/init-test-db.sql` con `CREATE DATABASE cocos_test;`
- [X] T009 [P] Crear `.env.example` con `NODE_ENV`, `PORT=3000`, `DATABASE_URL`, `DATABASE_URL_TEST`, `DB_POOL_MAX=10`, `DB_STATEMENT_TIMEOUT_MS=5000`, `DB_LOCK_TIMEOUT_MS=5000`, `DB_IDLE_IN_TX_TIMEOUT_MS=10000`, `REQUEST_TIMEOUT_MS=10000`, `SHUTDOWN_TIMEOUT_MS=10000`, `TRUST_PROXY=0`, `CORS_ORIGINS`, `BODY_LIMIT=100kb`, `RATE_LIMIT_WINDOW_MS=60000`, `RATE_LIMIT_MAX=300`, `ORDERS_RATE_LIMIT_MAX=30`, `LOG_LEVEL=info` (el `.gitignore` existente ya ignora `.env.*` y conserva `.env.example`)

**Checkpoint**: `npm run lint`, `npm run typecheck` y `docker compose up -d postgres` funcionan sobre el proyecto vacío.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestructura que usan todas las historias.

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase.

### Tests de la base ⚠️ (escribir primero, deben FALLAR)

- [X] T010 [P] Unit test de configuración en `src/config.spec.ts`: `loadConfig` rechaza `DATABASE_URL` ausente y `PORT` no numérico con un mensaje que nombra la variable; aplica los defaults de `.env.example`; el error se escribe en `process.stderr`, nunca con `console`
- [X] T011 [P] Unit test de dinero en `src/shared/money.spec.ts`: `formatMoney` devuelve `{ amount: "1234.50", currency: "ARS" }` con exactamente 2 decimales y redondeo `ROUND_HALF_EVEN`; `formatPct` devuelve string con 2 decimales o `null`; `0.1 + 0.2` da `"0.30"` exacto
- [X] T012 [P] Unit test del middleware de errores en `src/shared/http/error-handler.spec.ts`: los errores de dominio llevan solo `code` y el middleware asigna el status según el mapa `code → status` de las Referencias rápidas; error de zod → `400` `VALIDATION_FAILED` con `errors[]` (`field`, `message`); body demasiado grande (`type: 'entity.too.large'`) → `413 PAYLOAD_TOO_LARGE`; error de Postgres `55P03` → `409 CONCURRENT_REQUEST`; error desconocido → `500 INTERNAL_ERROR` sin stack ni SQL en el body; `Content-Type: application/problem+json`; incluye `traceId`; en `429` agrega `Retry-After`
- [X] T013 [P] Unit test del middleware de validación en `src/shared/http/validate.spec.ts`: deja en `req.validated` el valor parseado de body, query, params y headers; un campo desconocido con `.strict()` produce `VALIDATION_FAILED`
- [X] T014 [P] Unit tests de `computeHoldings` en `src/holdings/compute-holdings.spec.ts` con las reglas de [research.md R3](research.md#r3-cálculo-de-saldos-y-posiciones): `CASH_IN` suma `size`; `CASH_OUT` resta `size`; `BUY FILLED` resta `size × price` y recalcula el costo promedio `avg = (qty × avg + size × price) / (qty + size)`; `SELL FILLED` suma `size × price` sin cambiar el costo promedio; `BUY NEW` reserva `size × price`; `SELL NEW` reserva `size` acciones; `REJECTED` y `CANCELLED` no afectan; el costo promedio se reinicia cuando la cantidad llega a ≤ 0; con las 11 órdenes del usuario 1 de `database.sql` da `cashBalance` `753000.00`, `reservedCash` `125500.00`, instrumento 47 con 40 acciones a costo 930, instrumento 54 con 500 a costo 250 e instrumento 31 con −10
- [X] T015 [P] Unit test en `src/shared/http/request-timeout.spec.ts`: si el handler no responde antes de `REQUEST_TIMEOUT_MS`, pasa `RequestTimeoutError` a `next`; si responde antes, no hace nada y limpia el timer
- [X] T016 [P] Unit test en `src/shared/http/origin-check.spec.ts`: en `POST`, `PUT`, `PATCH` y `DELETE` con `Origin` fuera de `CORS_ORIGINS` pasa `OriginNotAllowedError`; sin header `Origin` o con un origen permitido deja pasar; en `GET` no verifica
- [X] T017 [P] Unit test en `src/shared/http/require-https.spec.ts`: con `NODE_ENV=production` y `req.secure === false` pasa `HttpsRequiredError`; con `req.secure === true` deja pasar; fuera de producción deja pasar siempre
- [X] T018 [P] Unit test del logger en `src/shared/logger.spec.ts`: al loguear un objeto con `req.headers.cookie`, `req.headers.authorization` y `user.email`, la salida JSON los muestra como `[Redacted]`; el nivel sale de `LOG_LEVEL` (principio XIV)
- [X] T019 [P] Crear `test/helpers/db.ts`: conecta a `DATABASE_URL_TEST`, corre las migraciones una vez, `resetDb()` con `TRUNCATE ... RESTART IDENTITY CASCADE` y `loadChallengeSeed()` que ejecuta los `INSERT` de `database.sql`
- [X] T020 [P] Crear `test/helpers/factories.ts`: `createUser()`, `createInstrument({ ticker, name, type })`, `createMarketData({ instrumentId, close, previousClose, date })`, `createOrder({ ... })` y `cashIn(userId, amount)` sobre el instrumento `MONEDA`, todas con montos como string decimal
- [X] T021 Crear `test/helpers/test-app.ts`: `buildTestApp()` que arma `createApp` (de `src/app.ts`) con la config de test y el `DataSource` de test, para usar con `supertest(app)` sin levantar el servidor. Falla hasta que exista T046 (depende de T019)
- [X] T022 [P] Test funcional de infraestructura en `test/infra.functional.spec.ts`: `/health/live` y `/health/ready` responden `200`; una ruta inexistente devuelve `404` en Problem Details; `/docs-json` devuelve un OpenAPI 3.1; un `POST` con `Origin` no permitido devuelve `403 ORIGIN_NOT_ALLOWED`; un body mayor a `BODY_LIMIT` devuelve `413 PAYLOAD_TOO_LARGE`; con config de producción y `TRUST_PROXY=1`, un request con `X-Forwarded-Proto: http` devuelve `403 HTTPS_REQUIRED` y la respuesta incluye `Strict-Transport-Security` (depende de T021)
- [X] T023 [P] Test funcional de repositorios en `test/repositories.functional.spec.ts` sobre el seed del challenge: `findLatestByInstrumentIds([47])` devuelve `close` `925.85` y `previousClose` `921.80` (fila del `2023-07-14`); un instrumento sin precio no aparece en el resultado; `findHoldingOrders` del usuario 1 devuelve 9 órdenes (`FILLED` y `NEW`) ordenadas por `datetime, id`; `lockForUpdate` sobre un usuario inexistente devuelve `false` (depende de T019)
- [X] T024 [P] Test funcional de apagado en `test/shutdown.functional.spec.ts` (principio XVII): envolver la app de `buildTestApp()` en un `express()` externo con una ruta `/__slow` que responde a los 500 ms, levantarlo con `startServer` en el puerto 0 y llamar a `shutdown()` con ese request en curso: el request termina con `200`, `/health/ready` responde `503` durante el apagado, no se aceptan conexiones nuevas y al final el `DataSource` queda cerrado. Falla hasta que exista T047 (depende de T019, T021)

### Implementación de la base

- [X] T025 Implementar `src/config.ts`: schema zod de todas las variables de `.env.example`, `dotenv` en desarrollo; si falla escribe el error con `process.stderr.write` y sale con `process.exit(1)` (única lectura de `process.env` del código); exportar `loadConfig(env)` para los tests y `config` (depende de T010)
- [X] T026 [P] Implementar `src/shared/logger.ts`: instancia de `pino` con `LOG_LEVEL` y `redact` para `req.headers.cookie`, `req.headers.authorization` y `*.email` (depende de T018)
- [X] T027 [P] Implementar `src/shared/money.ts` sobre `decimal.js`: `toDecimal`, `formatMoney(value)` → `{ amount, currency: 'ARS' }`, `formatPct(value | null)` (depende de T011)
- [X] T028 [P] Implementar `src/shared/errors.ts`: clase base `DomainError` que lleva **solo** `code` y un mensaje (sin status HTTP), y las subclases `NotFoundError`, `ValidationFailedError`, `OriginNotAllowedError`, `HttpsRequiredError`, `OrderNotCancellableError`, `ConcurrentRequestError`, `IdempotencyKeyReusedError`, `PriceUnavailableError`, `ZeroQuantityError`, `RateLimitedError` (con `retryAfterSeconds`) y `RequestTimeoutError`, con los `code` de las Referencias rápidas
- [X] T029 Implementar `src/shared/http/error-handler.ts`: middleware `(err, req, res, next)` con el mapa `code → status` de las Referencias rápidas (único lugar donde se decide el status HTTP); convierte `ZodError`, `DomainError`, `entity.too.large`, el error de Postgres `55P03` y cualquier otro error a Problem Details (`type`, `title`, `status`, `code`, `detail`, `errors?`, `traceId` = `req.id`); agrega `Retry-After` en 429; loguea con nivel `error` solo los 5xx (depende de T012, T026, T028)
- [X] T030 [P] Implementar `src/shared/http/validate.ts`: `validate({ body?, query?, params?, headers? })` que parsea con zod y guarda el resultado tipado en `req.validated`; declarar `req.validated` y `req.id` en `src/types/express.d.ts` (depende de T013)
- [X] T031 [P] Implementar `src/shared/http/request-timeout.ts`: corta el request a los `REQUEST_TIMEOUT_MS` con `RequestTimeoutError` si no se envió respuesta (depende de T015)
- [X] T032 [P] Implementar `src/shared/http/origin-check.ts` según T016 (principio XVI) (depende de T016)
- [X] T033 [P] Implementar `src/shared/http/require-https.ts` según T017 (parte baseline del principio VII) (depende de T017)
- [X] T034 [P] Implementar `src/shared/http/openapi.ts`: `OpenAPIRegistry` compartido, registro del schema `ProblemDetails` y de las respuestas de error reutilizables, `buildOpenApiDocument()` (OpenAPI 3.1, `info` y `servers` como en `contracts/openapi.yaml`) y `openApiRouter` que sirve `/docs-json` y Swagger UI en `/docs` cuando `NODE_ENV !== 'production'`; y el helper `withCommonResponses(method, responses)` que agrega a toda operación las respuestas comunes del contrato: `403` (`ORIGIN_NOT_ALLOWED` / `HTTPS_REQUIRED`), `429`, `500` y `503`, más `413` en `POST`, `PUT` y `PATCH`. Toda ruta se registra con este helper (principio VI)
- [X] T035 [P] Implementar `src/holdings/compute-holdings.ts` como función pura sobre `decimal.js` que recibe órdenes ordenadas por `datetime, id` y devuelve `{ cashBalance, reservedCash, availableCash, positions: Map<instrumentId, { quantity, reservedQuantity, availableQuantity, averageCost }> }`, excluyendo el instrumento de pesos de las posiciones (depende de T014)
- [X] T036 [P] Crear la entidad `src/users/user.entity.ts` sobre la tabla `users`: `id` (`SERIAL` PK), `email` (`VARCHAR(255)`), `accountNumber` mapeado a la columna `accountnumber` (`VARCHAR(20)`)
- [X] T037 [P] Crear la entidad `src/instruments/instrument.entity.ts` sobre `instruments`: `id`, `ticker` (`VARCHAR(10)`), `name` (`VARCHAR(255)`), `type` (`VARCHAR(10)`, `ACCIONES` o `MONEDA`)
- [X] T038 [P] Crear la entidad `src/orders/order.entity.ts` sobre `orders`: `id`; `instrumentId` → `instrumentid`; `userId` → `userid`; `size` (`INT`); `price` (`NUMERIC(10,2)`, con transformer a string decimal); `type` (`MARKET` · `LIMIT`); `side` (`BUY` · `SELL` · `CASH_IN` · `CASH_OUT`); `status` (`NEW` · `FILLED` · `REJECTED` · `CANCELLED`); `datetime` (`TIMESTAMP` sin zona, siempre en UTC); exportar los enums como `const` de TypeScript
- [X] T039 [P] Crear la entidad `src/market-data/market-data.entity.ts` sobre `marketdata`: `id`, `instrumentId` → `instrumentid`, `high`, `low`, `open` (`NUMERIC(10,2)`, pueden ser `NULL`), `close` (`NUMERIC(10,2)`), `previousClose` → `previousclose`, `date` (`DATE`); transformer de `numeric` a string
- [X] T040 Implementar `src/data-source.ts`: `DataSource` de TypeORM para PostgreSQL con las entidades, `migrations: ['src/migrations/*.ts']`, `synchronize: false`, `extra.max = DB_POOL_MAX` y `extra.options` con `statement_timeout`, `lock_timeout` e `idle_in_transaction_session_timeout` desde la config; exportar el `DataSource` por defecto (lo usa el CLI de migraciones) y `createDataSource(url)` para tests (depende de T025, T036–T039)
- [X] T041 Crear la migración `src/migrations/0001-baseline.ts` que reproduce las 4 tablas de `database.sql` con `CREATE TABLE IF NOT EXISTS` (mismos tipos, nombres de columna y FKs), con `down` que las elimina en orden inverso (depende de T040)
- [X] T042 [P] Implementar `src/users/users.repository.ts`: `exists(userId)` y `lockForUpdate(manager, userId)` (`SELECT id FROM users WHERE id = $1 FOR UPDATE`, devuelve `false` si no existe) (depende de T023)
- [X] T043 [P] Implementar `src/market-data/market-data.repository.ts`: `findLatestByInstrumentIds(ids)` con `SELECT DISTINCT ON (instrumentid) ... ORDER BY instrumentid, date DESC, id DESC`, devuelve `Map<instrumentId, { close, previousClose }>` (depende de T023)
- [X] T044 [P] Implementar `src/holdings/holdings.repository.ts`: `findHoldingOrders(manager, userId)` que trae las órdenes `FILLED` y `NEW` del usuario ordenadas por `datetime, id`, para alimentar a `computeHoldings` (depende de T023)
- [X] T045 Implementar `src/health/health.routes.ts`: `GET /health/live` → `200`; `GET /health/ready` → `200` si `SELECT 1` responde y el servicio no se está apagando, `503` en otro caso; registrar ambos paths en OpenAPI con `withCommonResponses` (depende de T022, T034)
- [X] T046 Implementar `src/app.ts` como composition root: `createApp({ config, dataSource })` crea repositorios, services, controllers y routers por constructor; `app.set('trust proxy', TRUST_PROXY)`; registra en orden `helmet()`, `require-https`, `cors({ origin: CORS_ORIGINS })`, `express.json({ limit: BODY_LIMIT })`, `pino-http` (id desde `X-Request-Id` o `randomUUID()`), `origin-check`, rate limit global de `express-rate-limit` (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `standardHeaders: 'draft-8'`, handler que pasa `RateLimitedError`), `request-timeout`, health, `/docs`, rutas `/v1`, 404 en Problem Details y el error handler; `app.disable('x-powered-by')` (depende de T022, T029–T034, T040, T042–T045)
- [X] T047 Implementar `src/server.ts` exportando `startServer({ app, config, dataSource })` y `shutdown()` (el arranque del proceso solo corre bajo `require.main === module`): inicializa el `DataSource`, levanta `app.listen`, configura `server.requestTimeout` y `headersTimeout`, graceful shutdown con `SIGTERM`/`SIGINT` (readiness a no listo, `server.close`, `dataSource.destroy()`, salida forzada a los `SHUTDOWN_TIMEOUT_MS`) y salida con código 1 ante `unhandledRejection` y `uncaughtException`, logueadas con `logger.fatal` (depende de T046, T024)

**Checkpoint**: T010–T024 en verde. La app arranca, valida su config y responde health y docs.

---

## Phase 3: User Story 1 - Enviar una orden de compra o venta (Priority: P1) 🎯 MVP

**Goal**: `POST /v1/orders` registra órdenes MARKET (`FILLED` al último cierre) y LIMIT (`NEW` al precio límite), por cantidad o por monto, rechaza (`REJECTED`) cuando faltan pesos o acciones, es idempotente y no permite saldos negativos con envíos simultáneos.

**Independent Test**: con un usuario de saldo y tenencia conocidos, enviar las órdenes de los escenarios 2 a 6 y 9 de [quickstart.md](quickstart.md) y verificar estado, cantidad, precio y efecto en pesos y acciones.

### Tests for User Story 1 ⚠️ (escribir primero, deben FALLAR)

- [X] T048 [P] [US1] Unit tests de las estrategias en `src/orders/order-type.strategy.spec.ts`: `MarketOrderStrategy` usa el `close` vigente redondeado a 2 decimales, exige que no venga `price` y da `FILLED`; sin precio de mercado lanza `PriceUnavailableError`; `LimitOrderStrategy` usa el `price` enviado y da `NEW`
- [X] T049 [P] [US1] Unit tests de `OrdersService.create` en `src/orders/orders.service.spec.ts` con repositorios dobles: con `amount` calcula `size = floor(amount / precio)` y si da 0 lanza `ZeroQuantityError`; compra con `size × price` > `availableCash` → `REJECTED`; venta con `size` > `availableQuantity` → `REJECTED`; instrumento `MONEDA` → `ValidationFailedError`; usuario o instrumento inexistente → `NotFoundError`; clave repetida con el mismo hash devuelve la orden guardada sin insertar; clave repetida con otro hash → `IdempotencyKeyReusedError`; el mismo body con las claves en distinto orden produce el mismo hash
- [X] T050 [P] [US1] Test funcional de envío de orden (el que pide el enunciado) en `test/orders.functional.spec.ts`, sobre el seed del challenge y con `currency: "ARS"` en todos los bodies válidos: MARKET `BUY` 10 del instrumento 47 → `201`, `FILLED`, `price.amount` `925.85`, header `Location`; LIMIT `BUY` por `amount` `5000` a `price` `900` → `201`, `NEW`, `quantity` 5; compra de 10000 acciones del 47 → `201` `REJECTED` y el portfolio no cambia; venta de 100 del 54 → `FILLED` y de 1000 → `REJECTED`; LIMIT sin `price`, `quantity` y `amount` juntos o ninguno, `quantity` `-1` o `1.5`, sin `currency` o con `currency` `USD` → `400` sin registrar; `amount` `100` sobre el 47 → `422 ZERO_QUANTITY`; `instrumentId` 66 con `BUY` → `400`; usuario 999 → `404`; sin header `Idempotency-Key` → `400`
- [X] T051 [P] [US1] Test funcional de idempotencia en `test/orders-idempotency.functional.spec.ts`: el mismo request con la misma `Idempotency-Key` enviado 3 veces devuelve `201` y luego `200` con el mismo `id`, y en `orders` hay una sola fila nueva; la misma clave con otro body → `422 IDEMPOTENCY_KEY_REUSED`; la misma clave en otro usuario crea una orden distinta
- [X] T052 [P] [US1] Test funcional de concurrencia en `test/orders-concurrency.functional.spec.ts`: usuario nuevo con `cashIn` de `1000.00` y un instrumento a precio `100.00`; 20 compras MARKET de 1 acción en paralelo (`Promise.all`, claves distintas) → exactamente 10 `FILLED`, 10 `REJECTED` y `availableCash` final `0.00`; con 10 acciones en tenencia, 20 ventas de 1 en paralelo → exactamente 10 `FILLED`

### Implementation for User Story 1

- [X] T053 [P] [US1] Crear la entidad `src/orders/idempotency-key.entity.ts` sobre `idempotency_keys`: `id` (`SERIAL` PK), `userId` → `user_id` (`INT` NOT NULL FK → `users`), `key` (`VARCHAR(255)` NOT NULL), `requestHash` → `request_hash` (`CHAR(64)` NOT NULL), `orderId` → `order_id` (`INT` NOT NULL FK → `orders`), `responseStatus` → `response_status` (`SMALLINT` NOT NULL), `responseBody` → `response_body` (`JSONB` NOT NULL), `createdAt` → `created_at` (`TIMESTAMPTZ` NOT NULL DEFAULT `now()`); registrarla en `src/data-source.ts`
- [X] T054 [US1] Crear la migración `src/migrations/0002-idempotency-keys.ts` con la tabla de T053 y la restricción `UNIQUE (user_id, key)`; `down` elimina la tabla (depende de T053)
- [X] T055 [P] [US1] Implementar `src/orders/order-type.strategy.ts`: interfaz `OrderTypeStrategy { resolvePrice(input, lastPrice): Decimal; initialStatus(): OrderStatus }`, `MarketOrderStrategy`, `LimitOrderStrategy` y `orderTypeStrategies: Record<OrderType, OrderTypeStrategy>` (depende de T048)
- [X] T056 [P] [US1] Implementar `src/orders/orders.schemas.ts` en zod con `.openapi()`: `CreateOrderBody` `.strict()` con `userId` e `instrumentId` enteros > 0, `side` ∈ {`BUY`, `SELL`}, `type` ∈ {`MARKET`, `LIMIT`}, "`currency` obligatorio, ∈ {`ARS`}: moneda de `amount` y `price`", "Exactamente uno de `quantity` (entero > 0) o `amount` (decimal > 0, máx. 2 decimales)", "`type = LIMIT` → `price` obligatorio, decimal > 0, máx. 2 decimales. `type = MARKET` → `price` no se envía" (con `superRefine`); `IdempotencyHeaders` con `idempotency-key` string de 8 a 255; `OrderResponse` según `Order` de `contracts/openapi.yaml`; y `toOrderResponse(order)` que expone la columna `size` como `quantity`, formatea `price` con `formatMoney` y `datetime` como ISO 8601 UTC en `createdAt`
- [X] T057 [US1] Implementar `src/orders/orders.repository.ts`: `insert(manager, order)`, `findIdempotencyKey(manager, userId, key)`, `insertIdempotencyKey(manager, row)` y `findInstrument(id)` (depende de T053, T054)
- [X] T058 [US1] Implementar `OrdersService.create(input, idempotencyKey)` en `src/orders/orders.service.ts`: abre una transacción; `usersRepository.lockForUpdate` (`NotFoundError` si no existe); calcula el hash SHA-256 del body validado serializado como JSON con las claves ordenadas alfabéticamente; busca la clave (mismo hash → devuelve la respuesta guardada con `replayed: true`, otro hash → `IdempotencyKeyReusedError`); valida el instrumento (`NotFoundError` si no existe, `ValidationFailedError` si es `MONEDA`); obtiene el último precio; resuelve precio y estado con la estrategia; calcula `size` desde `quantity` o `amount` (`ZeroQuantityError` si da 0); calcula holdings con `holdingsRepository.findHoldingOrders` + `computeHoldings`; marca `REJECTED` si faltan pesos o acciones; inserta la orden con `datetime` en UTC y la clave en la misma transacción; sin llamadas de red dentro de la transacción (depende de T035, T042–T044, T055–T057)
- [X] T059 [US1] Implementar `src/orders/orders.controller.ts`: `create` toma `req.validated`, llama al service y responde `201` con header `Location: /v1/orders/{id}`, o `200` cuando es un replay (depende de T058)
- [X] T060 [US1] Implementar `src/orders/orders.routes.ts`: `POST /v1/orders` con un limiter de `express-rate-limit` propio (`ORDERS_RATE_LIMIT_MAX` por ventana), `validate({ body: CreateOrderBody, headers: IdempotencyHeaders })` y el controller; registrar el path con `withCommonResponses`, con request, header y las respuestas propias `201`, `200`, `400`, `404`, `409`, `422` (depende de T034, T059)
- [X] T061 [US1] Conectar el feature de órdenes en `src/app.ts`: construir `OrdersRepository`, `OrdersService` (con `dataSource`, `usersRepository`, `marketDataRepository`, `holdingsRepository`, estrategias) y `OrdersController`, y montar `ordersRouter` bajo `/v1` (depende de T060)
- [X] T062 [US1] Loguear en `OrdersService.create` (`src/orders/orders.service.ts`) un evento `info` `order.created` con `orderId`, `userId`, `instrumentId`, `side`, `type`, `status`, `size` y `replayed`, sin datos personales

**Checkpoint**: T048–T052 en verde. US1 se puede demostrar sola con Swagger UI o `requests.http`.

---

## Phase 4: User Story 2 - Consultar el portfolio (Priority: P2)

**Goal**: `GET /v1/users/{userId}/portfolio` devuelve pesos disponibles y reservados, valor total y posiciones con cantidad, valor de mercado, rendimiento total y retorno diario.

**Independent Test**: con el seed del challenge, el portfolio del usuario 1 coincide con los valores del escenario 1 de [quickstart.md](quickstart.md).

### Tests for User Story 2 ⚠️ (escribir primero, deben FALLAR)

- [X] T063 [P] [US2] Unit tests de `PortfolioService` en `src/portfolio/portfolio.service.spec.ts`: lista solo posiciones con `quantity > 0`; cada posición trae `instrumentId`, `ticker`, `name`, `quantity`, `averageCost` y `lastPrice`; `marketValue = quantity × close`; `totalReturnPct = (close − averageCost) / averageCost × 100`; `dailyReturnPct = (close − previousClose) / previousClose × 100`; sin precio → `marketValue`, `lastPrice` y `totalReturnPct` en `null` y la posición no suma al total; `previousClose` `0` o ausente → `dailyReturnPct` `null`; `totalAccountValue = cashBalance + Σ marketValue`; posiciones ordenadas por ticker; la respuesta incluye `userId`; usuario inexistente → `NotFoundError`
- [X] T064 [P] [US2] Test funcional en `test/portfolio.functional.spec.ts`: usuario 1 → `availableCash` `627500.00`, `reservedCash` `125500.00`, `totalAccountValue` `904784.00`, posición 47 con `quantity` 40, `marketValue` `37034.00`, `totalReturnPct` `-0.45`, `dailyReturnPct` `0.44`, posición 54 con `quantity` 500, `marketValue` `114750.00`, `totalReturnPct` `-8.20`, `dailyReturnPct` `-1.08`, sin el instrumento 31; usuario sin órdenes → todo en `0.00` y lista vacía; usuario 999 → `404`; `userId` `abc` → `400`; tras una compra MARKET el portfolio refleja la nueva cantidad (FR-012); tras una LIMIT `NEW` sube `reservedCash` y `totalAccountValue` no cambia

### Implementation for User Story 2

- [X] T065 [P] [US2] Implementar `src/portfolio/portfolio.schemas.ts` en zod con `.openapi()`: `PortfolioParams` (`userId` entero > 0 con `z.coerce`), `PositionResponse` y `PortfolioResponse` según `contracts/openapi.yaml` (`Money` como `{ amount, currency: 'ARS' }`, porcentajes como string o `null`)
- [X] T066 [US2] Implementar `src/portfolio/portfolio.service.ts`: `getPortfolio(userId)` usa `usersRepository.exists`, `holdingsRepository.findHoldingOrders`, `computeHoldings`, `marketDataRepository.findLatestByInstrumentIds` y los datos de `instruments` para armar el portfolio con `formatMoney` y `formatPct` (depende de T035, T042–T044, T063, T065)
- [X] T067 [US2] Implementar `src/portfolio/portfolio.controller.ts` y `src/portfolio/portfolio.routes.ts`: `GET /v1/users/:userId/portfolio` con `validate({ params: PortfolioParams })`; registrar en OpenAPI con `withCommonResponses` las respuestas propias `200`, `400`, `404` (depende de T066)
- [X] T068 [US2] Conectar el feature de portfolio en `src/app.ts` y montar el router bajo `/v1` (depende de T067)

**Checkpoint**: T063–T064 en verde. US1 y US2 funcionan juntas y por separado.

---

## Phase 5: User Story 3 - Buscar activos (Priority: P3)

**Goal**: `GET /v1/instruments?q=` devuelve instrumentos cuyo ticker o nombre contiene el texto, sin distinguir mayúsculas, excluyendo `MONEDA`, paginados por cursor y con su último precio.

**Independent Test**: los escenarios del punto 8 de [quickstart.md](quickstart.md) sobre el seed del challenge.

### Tests for User Story 3 ⚠️ (escribir primero, deben FALLAR)

- [X] T069 [P] [US3] Unit tests del cursor en `src/shared/pagination.spec.ts`: `encodeCursor({ ticker, id })` y `decodeCursor` son inversos; un cursor malformado lanza `ValidationFailedError`; `limit` por defecto 20 y máximo 100; `toPage` con `limit + 1` filas devuelve `hasMore: true` y el cursor de la última fila incluida
- [X] T070 [P] [US3] Test funcional en `test/instruments.functional.spec.ts`: `q=pam` incluye `PAMP`; `q=PAMPA` incluye "Pampa Holding S.A." (por nombre, sin distinguir mayúsculas); `q=ars` no incluye el instrumento `MONEDA`; `q=zzzz` → `data: []` y `hasMore: false`; `q=` → `400`; `limit=101` → `400`; `q=s&limit=5` devuelve 5 resultados y `nextCursor`, y recorrer todas las páginas no repite ni pierde instrumentos; `q=%` no devuelve todo el catálogo (comodines escapados); cada resultado trae `ticker`, `name`, `type` y `lastPrice` (`null` si no tiene precio)
- [X] T071 [P] [US3] Unit tests de `InstrumentsService` en `src/instruments/instruments.service.spec.ts` con repositorios dobles: agrega `lastPrice` formateado con `formatMoney` o `null` si no hay precio; arma la página con `toPage`

### Implementation for User Story 3

- [X] T072 [P] [US3] Implementar `src/shared/pagination.ts`: schema zod de `limit` (1–100, default 20) y `cursor`, `encodeCursor`/`decodeCursor` en base64url del par `(ticker, id)` y `toPage(rows, limit)` → `{ data, page: { nextCursor, hasMore } }` (depende de T069)
- [X] T073 [US3] Implementar `src/instruments/instruments.repository.ts`: `search({ q, limit, after })` con `(ticker ILIKE $q OR name ILIKE $q) AND type <> 'MONEDA'`, keyset `(ticker, id) > ($afterTicker, $afterId)`, `ORDER BY ticker, id`, `LIMIT limit + 1`; escapar `%`, `_` y `\` del texto del usuario; y `findById(id)` (depende de T070, T072)
- [X] T074 [US3] Implementar `src/instruments/instruments.schemas.ts` (`SearchQuery` con `q` de 1 a 100 caracteres más paginación, `InstrumentResponse`, `InstrumentPageResponse`) y `src/instruments/instruments.service.ts` (busca y agrega `lastPrice` con `marketDataRepository.findLatestByInstrumentIds`) (depende de T071, T073)
- [X] T075 [US3] Implementar `src/instruments/instruments.controller.ts` y `src/instruments/instruments.routes.ts`: `GET /v1/instruments` con `validate({ query: SearchQuery })`; registrar en OpenAPI con `withCommonResponses` las respuestas propias `200`, `400`; conectar en `src/app.ts` (depende de T074)

**Checkpoint**: T069–T071 en verde.

---

## Phase 6: User Story 4 - Cancelar una orden pendiente (Priority: P3)

**Goal**: `POST /v1/orders/{orderId}/cancellation` pasa a `CANCELLED` una orden `NEW` del usuario; cualquier otro estado se rechaza sin cambios.

**Independent Test**: el punto 7 de [quickstart.md](quickstart.md).

**Depends on**: US1 (módulo de órdenes y su repositorio).

### Tests for User Story 4 ⚠️ (escribir primero, deben FALLAR)

- [X] T076 [P] [US4] Unit tests de `OrdersService.cancel` en `src/orders/orders.service.spec.ts`: `NEW` → `CANCELLED`; `FILLED`, `REJECTED` o `CANCELLED` → `OrderNotCancellableError` sin modificar la orden; orden de otro usuario o inexistente → `NotFoundError`
- [X] T077 [P] [US4] Test funcional en `test/cancellation.functional.spec.ts`: cancelar la orden `NEW` 5 del usuario 1 del seed → `200` `CANCELLED` y `reservedCash` baja `35500.00`; repetir → `409 ORDER_NOT_CANCELLABLE`; cancelar la orden `FILLED` 2 → `409`; con `userId` 2 → `404`; `orderId` `abc` → `400`; cancelación y compra simultáneas del mismo usuario no dejan `availableCash` negativo

### Implementation for User Story 4

- [X] T078 [US4] Agregar a `src/orders/orders.repository.ts` `findByIdForUser(manager, orderId, userId)` y `updateStatus(manager, orderId, status)` (único `UPDATE` permitido sobre `orders`, solo `NEW → CANCELLED`)
- [X] T079 [US4] Implementar `OrdersService.cancel(orderId, userId)` en `src/orders/orders.service.ts`: en una transacción, `usersRepository.lockForUpdate`, busca la orden del usuario (`NotFoundError`), exige `status = NEW` (`OrderNotCancellableError`) y actualiza a `CANCELLED`; loguea `order.cancelled` (depende de T076, T078)
- [X] T080 [US4] Agregar `CancelOrderParams` (`orderId` entero > 0) y `CancelOrderBody` (`.strict()`, `userId` entero > 0) en `src/orders/orders.schemas.ts`, el método `cancel` en `src/orders/orders.controller.ts` (`200` con la orden) y la ruta `POST /v1/orders/:orderId/cancellation` en `src/orders/orders.routes.ts`, registrada en OpenAPI con `withCommonResponses` y las respuestas propias `200`, `400`, `404`, `409` (depende de T079)

**Checkpoint**: las cuatro historias funcionan; todos los tests en verde.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T081 [P] Crear `requests.http` (REST Client) con un ejemplo por escenario de [quickstart.md](quickstart.md): portfolio, búsqueda con y sin cursor, orden MARKET y LIMIT por cantidad y por monto (con `currency: "ARS"`), rechazos, replay de idempotencia y cancelación, usando variables `@baseUrl` y `@userId`
- [X] T082 [P] Test de contrato en `test/openapi.functional.spec.ts`: lee `specs/001-portfolio-orders-api/contracts/openapi.yaml` con el paquete `yaml` y verifica que el documento de `/docs-json` tenga exactamente los mismos paths, métodos y códigos de respuesta por operación
- [X] T083 [P] Smoke test de latencia para SC-005 en `test/load/portfolio-search.k6.js`: 10 usuarios virtuales durante 30 s contra `GET /v1/users/1/portfolio` y `GET /v1/instruments?q=s`, con `thresholds: { http_req_duration: ['p(95)<1000'], http_req_failed: ['rate<0.01'] }` y `BASE_URL` por variable de entorno; la API se levanta para el smoke con `RATE_LIMIT_MAX=100000`, para que el limiter no contamine la medición (el rate limit se prueba en los tests funcionales), y eso se documenta en el README; registrar p95, p99, tasa de error y RPS obtenidos en el README (principio XI)
- [X] T084 [P] Reescribir `README.md`: requisitos (incluida la instalación de `k6`), configuración (`.env.example`), levantar con `docker compose`, migraciones, correr la API, tests, compuertas y smoke de latencia, URL de Swagger, uso de `requests.http`; sección de suposiciones y decisiones de diseño (las de `spec.md` Assumptions y `research.md`: saldos derivados de `orders`, reservas de órdenes `NEW`, rendimiento contra costo promedio más retorno diario, lock por usuario, idempotencia con hash canónico, casos `422` sin registrar, `currency` obligatorio, `require-https` en producción, anomalía del instrumento 31 del usuario 1, desvíos del esquema heredado) y los resultados de T083
- [X] T085 [P] Crear `.github/workflows/ci.yml`: Node 24 con cache de npm, `npm ci`, `npm audit --audit-level=high`, lint, typecheck, `check:cycles`, `npm test` (con umbral de cobertura), servicio `postgres:16` con `database.sql` y la base `cocos_test`, `migration:run`, `test:functional`, y el smoke de k6: `npm run build`, `RATE_LIMIT_MAX=100000 node dist/server.js &`, esperar con reintentos a que `/health/ready` responda `200`, y recién entonces `grafana/setup-k6-action` y `npm run test:load`
- [X] T086 Revisar que `npm run lint` (`eslint.config.mjs`) y `npm run check:cycles` pasen sobre `src/` y `test/` sin excepciones no justificadas; cada `eslint-disable` lleva comentario con el motivo
- [X] T087 Recorrer los 9 escenarios de `specs/001-portfolio-orders-api/quickstart.md` contra la app levantada con `docker compose` y `npm run dev`, y corregir cualquier diferencia con los valores esperados
- [X] T088 Eliminar el comentario "Sync Impact Report" del inicio de `.specify/memory/constitution.md` antes del commit final

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup. Bloquea todas las historias. Dentro de la fase, los tests T010–T024 van antes que la implementación T025–T047.
- **US1 (Phase 3)**: depende de Foundational.
- **US2 (Phase 4)**: depende de Foundational. Independiente de US1 (usa `computeHoldings` y los repositorios compartidos); solo su escenario "tras una compra MARKET" de T064 usa `POST /v1/orders` de US1.
- **US3 (Phase 5)**: depende de Foundational. Independiente de las demás.
- **US4 (Phase 6)**: depende de US1 (módulo de órdenes).
- **Polish (Phase 7)**: depende de todas las historias.

### User Story Dependencies

```text
Setup → Foundational ─┬─► US1 (P1) ──► US4 (P3)
                      ├─► US2 (P2)
                      └─► US3 (P3)
                                   └──► Polish
```

### Within Each Phase

- Tests primero, y deben fallar.
- Entidades y schemas → repositorio → service → controller → rutas → conexión en `src/app.ts`.
- La fase termina cuando sus tests pasan y las compuertas (lint, typecheck, ciclos, cobertura) siguen en verde.

### Parallel Opportunities

- Setup: T003–T009 en paralelo después de T001–T002.
- Foundational: los tests T010–T020 en paralelo; T022–T024 en paralelo tras T019–T021; luego T026–T028, T030–T039 y T042–T044 en paralelo entre sí.
- Una vez terminada Foundational, US1, US2 y US3 pueden avanzar en paralelo.
- Dentro de cada historia, todos los tests marcados `[P]` en paralelo.
- Polish: T081–T085 en paralelo.

---

## Parallel Example: Foundational

```bash
# Tests de la base en paralelo (todos deben fallar al principio):
T010 src/config.spec.ts
T011 src/shared/money.spec.ts
T012 src/shared/http/error-handler.spec.ts
T013 src/shared/http/validate.spec.ts
T014 src/holdings/compute-holdings.spec.ts
T015 src/shared/http/request-timeout.spec.ts
T016 src/shared/http/origin-check.spec.ts
T017 src/shared/http/require-https.spec.ts
T018 src/shared/logger.spec.ts
```

## Parallel Example: User Story 1

```bash
# Tests de US1 en paralelo (todos deben fallar al principio):
T048 src/orders/order-type.strategy.spec.ts
T049 src/orders/orders.service.spec.ts
T050 test/orders.functional.spec.ts
T051 test/orders-idempotency.functional.spec.ts
T052 test/orders-concurrency.functional.spec.ts

# Después, en paralelo:
T053 src/orders/idempotency-key.entity.ts
T055 src/orders/order-type.strategy.ts
T056 src/orders/orders.schemas.ts
```

## Parallel Example: User Story 2 y 3 (después de Foundational)

```bash
T063 src/portfolio/portfolio.service.spec.ts
T064 test/portfolio.functional.spec.ts
T069 src/shared/pagination.spec.ts
T070 test/instruments.functional.spec.ts
T071 src/instruments/instruments.service.spec.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) y Phase 2 (Foundational).
2. Phase 3 (US1): envío de órdenes con idempotencia y concurrencia segura.
3. **Parar y validar**: T048–T052 en verde y escenarios 2–6 y 9 de `quickstart.md`. Es lo que el enunciado exige testear.

### Incremental Delivery

1. Base lista → US1 (MVP) → validar.
2. US2 (portfolio) → validar contra los valores del usuario 1.
3. US3 (búsqueda) → validar.
4. US4 (cancelación) → validar.
5. Polish: colección de requests, contrato, smoke de latencia, README con decisiones, CI.

### Notes

- `[P]` = archivos distintos, sin dependencias pendientes.
- Commit por tarea o por grupo lógico, con Conventional Commits.
- No mezclar refactor con cambio de comportamiento en el mismo commit.
- Ante una duda del enunciado: elegir la opción documentada en `research.md`, o registrar la nueva suposición en el README.

---

## Phase 8: Convergence

**Purpose**: trabajo que quedó sin cumplir al comparar el código con el spec, el plan y la constitution (`/speckit-converge`). Cada tarea se hace test-first.

- [ ] T089 CRITICAL: rechazar los campos desconocidos en la query y los params: escribir primero un test en `test/instruments.functional.spec.ts` (`GET /v1/instruments?q=a&foo=1` → `400 VALIDATION_FAILED` con `foo` en `errors[]`) y tests equivalentes para `/v1/users/{userId}/portfolio?x=1` y `/v1/orders/{orderId}/cancellation?x=1`; después hacer `.strict()` a `SearchQuery` en `src/instruments/instruments.schemas.ts`, a `PortfolioParams` en `src/portfolio/portfolio.schemas.ts` y a `CancelOrderParams` en `src/orders/orders.schemas.ts`, y la query vacía de portfolio y cancelación en `src/shared/http/validate.ts` si hace falta per Constitution III (contradicts)
- [ ] T090 Agregar los tests funcionales del rate limit en `test/rate-limit.functional.spec.ts` con `RATE_LIMIT_MAX` bajo: superar el límite devuelve `429 RATE_LIMITED` en `application/problem+json` con header `Retry-After` entero; pasada la ventana vuelve a responder; `ORDERS_RATE_LIMIT_MAX` limita `POST /v1/orders` y `POST /v1/orders/{orderId}/cancellation` antes que el límite global; `Retry-After` decrece con el tiempo (falla hasta T091) per Constitution XII (partial)
- [ ] T091 Corregir `Retry-After` en `rateLimiter` de `src/app.ts` y `RateLimitedError` de `src/shared/errors.ts` para que sea el tiempo restante de la ventana (`Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000)`, mínimo 1) y no la ventana completa, y declarar el tipo de `req.rateLimit` en `src/types/express.d.ts` (depende de T090) per Constitution XII (partial)
- [ ] T092 Agregar el test funcional del `409 CONCURRENT_REQUEST` en `test/lock-timeout.functional.spec.ts`: con `DB_LOCK_TIMEOUT_MS` bajo (300), una transacción externa retiene `SELECT id FROM users WHERE id = 1 FOR UPDATE` y `POST /v1/orders` del mismo usuario responde `409` con `code` `CONCURRENT_REQUEST`; después de liberar el lock, el mismo envío con la misma `Idempotency-Key` funciona (`201`) per plan: research R4 (partial)
- [ ] T093 Cubrir los casos borde de montos del spec en `test/orders.functional.spec.ts`: `amount` `"0"`, `"0.00"` y `"-5"`, y `price` `"0"` en una LIMIT, deben dar `400 VALIDATION_FAILED` y no registrar ninguna orden per spec Edge Cases (partial)
