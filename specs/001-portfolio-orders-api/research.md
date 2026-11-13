# Research: Portfolio, búsqueda de activos y envío de órdenes

**Feature**: `001-portfolio-orders-api` | **Date**: 2026-11-13

Cada decisión sigue el formato Decision / Rationale / Alternatives considered.

## R1. Framework y runtime

- **Decision**: Node.js 24 LTS, TypeScript 5 (`strict`), Express 5, TypeORM 0.3 sobre PostgreSQL 16.
- **Rationale**: el enunciado pide Express.js y TypeORM. Express 5 propaga los errores de handlers `async` al middleware de errores sin wrappers. Node 24 es la LTS activa y la instalada localmente.
- **Alternatives considered**: NestJS (permitido por el enunciado, pero el usuario eligió lo que el enunciado nombra primero); Express 4 (requiere `express-async-errors` o wrappers para errores async).

## R2. Validación y documentación de la API

- **Decision**: `zod` 4 para validar body, query, params y headers; `@asteasolutions/zod-to-openapi` para generar el OpenAPI desde esos mismos schemas; `swagger-ui-express` para servirlo en `/docs`.
- **Rationale**: un solo schema produce el tipo TypeScript, la validación en runtime y la documentación, así que no pueden desincronizarse (principios III y VI).
- **Alternatives considered**: `class-validator` + `routing-controllers` (decoradores, más piezas, peor inferencia de tipos); `express-openapi-validator` con OpenAPI escrito a mano (el documento y el código se mantienen por separado).

## R3. Cálculo de saldos y posiciones

- **Decision**: una función pura `computeHoldings(orders)` en `src/holdings/` recibe las órdenes `FILLED` y `NEW` del usuario en orden cronológico y devuelve pesos disponibles, pesos reservados y, por instrumento, cantidad, cantidad reservada y costo promedio. La usan tanto el portfolio como la validación de órdenes.
- **Rationale**: una única fuente de verdad para las reglas FR-014 a FR-017; se testea con unit tests sin base de datos. El costo promedio necesita procesar las órdenes en orden, cosa que un `SUM` en SQL no resuelve.
- **Alternatives considered**: agregados `SUM(CASE ...)` en SQL (rápidos, pero el costo promedio queda en otro lado y la regla se duplica); tabla de posiciones materializada (estado extra a mantener en sincronía; violaría el principio V sin un requisito de carga).

Reglas de cálculo (de FR-014 a FR-017a):

| Orden | Efecto en pesos | Efecto en acciones |
|---|---|---|
| `CASH_IN` `FILLED` | + `size` | — |
| `CASH_OUT` `FILLED` | − `size` | — |
| `BUY` `FILLED` | − `size × price` | + `size`; recalcula costo promedio |
| `SELL` `FILLED` | + `size × price` | − `size`; costo promedio sin cambio |
| `BUY` `NEW` | reserva `size × price` | — |
| `SELL` `NEW` | — | reserva `size` |
| `REJECTED`, `CANCELLED` | — | — |

- Costo promedio: en cada compra `avg = (qty × avg + size × price) / (qty + size)`; si una venta deja la cantidad en cero o menos, el costo promedio se reinicia.
- Toda la aritmética con `decimal.js`; los importes se redondean a 2 decimales (`ROUND_HALF_EVEN`) solo al serializar.

## R4. Concurrencia: órdenes simultáneas del mismo usuario

- **Decision**: cada envío de orden corre en una transacción `READ COMMITTED` que empieza con `SELECT id FROM users WHERE id = $1 FOR UPDATE`. Con el usuario bloqueado se leen sus órdenes, se calcula lo disponible, se decide el estado y se inserta la orden. La cancelación toma el mismo lock.
- **Rationale**: serializa solo las órdenes de un mismo usuario (usuarios distintos no se bloquean entre sí), no requiere cambios de esquema y es la estrategia más simple que hace imposible el saldo negativo (FR-009, SC-002). La transacción no hace llamadas de red.
- **Alternatives considered**: `pg_advisory_xact_lock(userId)` (equivalente, pero un mecanismo menos conocido sin beneficio aquí); `SERIALIZABLE` con reintentos (correcto pero exige manejar `40001` y reintentar); `UPDATE` atómico sobre una columna de saldo (no existe saldo materializado y crearlo violaría el principio V).
- **Timeout**: `lock_timeout` configurable (default 5 s). Si vence, la API responde `409 CONCURRENT_REQUEST` para que el cliente reintente con la misma `Idempotency-Key`.

## R5. Idempotencia del envío de órdenes (principio IX)

- **Decision**: header `Idempotency-Key` obligatorio en `POST /v1/orders`. Nueva tabla `idempotency_keys` con `UNIQUE (user_id, key)`, el hash SHA-256 del body canónico (el body ya validado por zod, serializado como JSON con las claves ordenadas alfabéticamente, para que el orden de las claves no cambie el hash), el id de la orden y la respuesta. Se consulta e inserta **dentro de la misma transacción y bajo el mismo lock de usuario** que la orden.
- **Rationale**: como dos requests con la misma clave del mismo usuario quedan serializados por el lock (R4), el segundo siempre encuentra la clave ya completada y devuelve la respuesta original. No hace falta un estado `in_progress`; el `409` por "en curso" no puede ocurrir con este diseño, y la constitution lo cubre igual porque no existe un estado observable en curso. Misma clave con otro body → `422 IDEMPOTENCY_KEY_REUSED`.
- **Alternatives considered**: guardar la clave en una columna de `orders` (modifica el esquema heredado y mezcla responsabilidades); clave en Redis (dependencia extra y sin atomicidad con la escritura de la orden).
- Las requests inválidas (`400`, `404`, `422` de datos) no guardan la clave: no se registró nada.

## R6. Casos que no generan orden

- **Decision**: no se registra orden (y se responde error) cuando: los datos son inválidos (`400`); el usuario o el instrumento no existen (`404`); el instrumento es de tipo `MONEDA` (`400`); falta el precio de un instrumento para una orden MARKET (`422 PRICE_UNAVAILABLE`); el monto en pesos da cero acciones (`422 ZERO_QUANTITY`). Sí se registra como `REJECTED` (y se responde `201`) cuando faltan pesos o acciones.
- **Rationale**: el enunciado pide guardar `REJECTED` solo para "monto mayor al disponible". Una orden sin precio o sin cantidad no tiene valores válidos para las columnas `price` y `size`.
- **Alternatives considered**: registrar también esos casos como `REJECTED` con `size = 0` o `price = NULL` (ensucia los datos con filas sin sentido económico).

## R7. Último precio y retorno diario

- **Decision**: el último precio de un instrumento es el `close` de su fila de `marketdata` con mayor `date` (desempate por `id`). Se obtiene en una sola query con `DISTINCT ON (instrumentid) ... ORDER BY instrumentid, date DESC, id DESC`.
- **Rationale**: `marketdata` guarda una fila por día; los datos tienen 2 días por instrumento y 63 de 66 instrumentos con precio.
- **Alternatives considered**: tomar el `id` mayor (depende del orden de inserción, frágil).

## R8. Anomalía en los datos semilla

- **Finding**: el usuario 1 tiene, sobre el instrumento 31, una compra `FILLED` de 20 y una venta `FILLED` de 30: posición neta −10.
- **Decision**: los datos históricos se respetan tal cual (append-only). Las posiciones con cantidad ≤ 0 no se listan (FR-015), la venta sí impacta en los pesos, y una nueva venta sobre ese instrumento se rechaza por acciones insuficientes. Se documenta en el README.
- **Alternatives considered**: corregir el dato (viola el principio IV); fallar al calcular (rompe el portfolio del usuario por un dato heredado).

## R9. Esquema heredado y migraciones

- **Decision**: migración `0001-baseline` que crea las 4 tablas de `database.sql` con `CREATE TABLE IF NOT EXISTS` (no-op sobre una base ya creada por el script); migración `0002-idempotency-keys`. Los datos de ejemplo se cargan con `database.sql` (Docker init) o con el seed de tests.
- **Rationale**: el principio IV pide capturar un esquema existente como baseline sin reescribirlo.
- **Desvíos aceptados** (ver Complexity Tracking del plan): `orders.datetime` es `TIMESTAMP` sin zona (se guarda y se interpreta siempre como UTC); columnas en minúscula (`instrumentid`, `previousclose`), que las entidades mapean de forma explícita; `price` es `NUMERIC(10,2)`, así que el `close` con más decimales se redondea a 2 al guardarse en la orden.
- **Alternatives considered**: `synchronize: true` (prohibido); reescribir el esquema con `timestamptz` y snake_case (rompe la compatibilidad con los datos y el script del challenge).

## R10. Índices

- **Decision**: ninguno adicional en esta feature.
- **Rationale**: con los volúmenes del challenge no hay medición que lo justifique (principio V). Disparadores registrados: `orders (userid)` y `marketdata (instrumentid, date DESC)` cuando un `EXPLAIN ANALYZE` con volumen muestre un scan costoso; un índice `pg_trgm` para la búsqueda cuando el catálogo crezca.

## R11. Paginación de la búsqueda

- **Decision**: paginación por cursor (keyset) sobre `(ticker, id)`, `limit` default 20 y máximo 100, respuesta `{ data, page: { nextCursor, hasMore } }`. Búsqueda con `ILIKE '%texto%'` sobre `ticker` y `name`, excluyendo `type = 'MONEDA'`.
- **Rationale**: es el esquema único que fija `api-conventions`; el orden por ticker es el natural para el usuario.
- **Alternatives considered**: offset (más simple, pero la constitution pide un solo esquema y el cursor es el default).

## R12. Carga esperada

- **Decision**: el spec no fija requisito de throughput. Supuesto: uso de evaluación (decenas de usuarios, pocas RPS), así que no hay prueba de estrés. Sí hay un requisito de latencia (SC-005: p95 < 1 s en portfolio y búsqueda), que el principio XI obliga a verificar: smoke test de k6 con 10 usuarios virtuales durante 30 s y umbral `p(95)<1000`. Además, tests de concurrencia sobre el saldo. El diseño sigue siendo stateless, con transacciones cortas y pool de conexiones configurado (`DB_POOL_MAX`, default 10).

## R13. Herramientas de soporte

| Necesidad | Decisión |
|---|---|
| Logs | `pino` + `pino-http`, correlation id desde `X-Request-Id` o generado |
| Seguridad HTTP | `helmet`, `cors` (orígenes de config), `express.json({ limit: '100kb' })` |
| Rate limit | `express-rate-limit`, store en memoria (una sola instancia), más estricto en `POST /v1/orders` |
| Tests | Jest 30 + `ts-jest`, Supertest, PostgreSQL de test por Docker Compose; `k6` para el smoke de latencia; `yaml` para leer el contrato en el test de OpenAPI |
| Migraciones | CLI de TypeORM con `ts-node` (`typeorm-ts-node-commonjs`) |
| HTTPS | Middleware `require-https` en producción (con `trust proxy`) + HSTS de `helmet` |
| Calidad | ESLint 9 + `typescript-eslint` type-checked, `eslint-plugin-import` (`import/no-cycle`), Prettier |
| Colección de requests | `requests.http` (REST Client), uno de los formatos que pide el enunciado |
| Entorno local | `docker-compose.yml` con PostgreSQL que ejecuta `database.sql` al iniciar |
