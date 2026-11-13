# Implementation Plan: Portfolio, búsqueda de activos y envío de órdenes

**Branch**: `001-portfolio-orders-api` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-portfolio-orders-api/spec.md`

## Summary

API REST con cuatro operaciones: enviar una orden (MARKET o LIMIT, por cantidad o por monto),
cancelar una orden `NEW`, consultar el portfolio de un usuario y buscar activos. Saldos y
posiciones no se guardan: se derivan siempre de la tabla `orders` con una única función pura
(`computeHoldings`). El envío de órdenes corre en una transacción que bloquea la fila del
usuario, lo que impide saldos negativos con órdenes simultáneas, y es idempotente con una
`Idempotency-Key` guardada en la misma transacción. Express 5 + TypeORM sobre el esquema
heredado de `database.sql`, con validación y OpenAPI generados desde schemas de zod.

## Technical Context

**Language/Version**: TypeScript 5 (`strict`) sobre Node.js 24 LTS

**Primary Dependencies**: Express 5, TypeORM 0.3, `pg`, `zod` 4,
`@asteasolutions/zod-to-openapi`, `swagger-ui-express`, `decimal.js`, `pino`, `pino-http`,
`helmet`, `cors`, `express-rate-limit`

**Storage**: PostgreSQL 16 con el esquema de `database.sql` más la tabla `idempotency_keys`

**Testing**: Jest 30 + `ts-jest` (unit), Jest + Supertest contra PostgreSQL de test (funcionales HTTP y concurrencia)

**Target Platform**: servidor Linux (contenedor) o local con Docker Compose para la base

**Project Type**: web service (API REST, solo backend)

**Performance Goals**: sin requisito en el enunciado. Supuesto (R12): uso de evaluación, pocas RPS; SC-005 pide p95 < 1 s en portfolio y búsqueda con los datos de prueba

**Constraints**: cero saldos o tenencias negativas por concurrencia; mismo envío → una sola orden; importes exactos al centavo; esquema heredado sin cambios destructivos

**Scale/Scope**: 4 usuarios, 66 instrumentos, 126 filas de precios en los datos de ejemplo; 4 endpoints de negocio + health + docs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Principios BASELINE

| # | Principio | Estado | Cómo se cumple |
|---|---|---|---|
| I | Test-First | ✅ | Tests de `computeHoldings`, estrategias de orden y services antes del código; funcional HTTP por endpoint, incluido el test funcional de envío de orden que pide el enunciado |
| II | Arquitectura en capas | ✅ | Features `orders`, `portfolio`, `instruments` con controller → service → repository; composition root en `src/app.ts`; `holdings` y `market-data` como módulos compartidos sin ciclos |
| III | Tipado y validación | ✅ | zod en todos los inputs (`.strict()`), ids validados; respuestas por mappers, nunca entidades |
| IV | Integridad de datos | ⚠️ | Migraciones baseline + `0002`; transacción por envío/cancelación; `decimal.js`; append-only salvo `NEW → CANCELLED`. Desvíos del esquema heredado en Complexity Tracking |
| V | Simplicidad | ✅ | Sin tablas de saldo, sin cache, sin colas, sin índices nuevos; un solo cálculo de holdings |
| VI | Contrato de API | ✅ | OpenAPI desde zod en `/docs`; `/v1`; montos string + `ARS`; fechas UTC; búsqueda paginada por cursor |
| XI | Preparado para escalar | ✅ | Stateless; lock por usuario (no global); transacción corta sin red; pool configurado; test de concurrencia; carga supuesta registrada (R12) |
| XII | Rate limiting | ✅ | Global en memoria (una instancia) + límite estricto en `POST /v1/orders`; `429` con `Retry-After` |
| XIII | Patrones | ✅ | Ver Pattern Decision |
| XIV | Errores y observabilidad | ✅ | Middleware único → Problem Details con `code`; `pino` con correlation id; `/health/live` y `/health/ready` |
| XV | Smells automáticos | ✅ | ESLint type-checked con los límites por defecto, `import/no-cycle`, cobertura ≥ 80% en CI |
| XVI | Seguridad | ✅ | `helmet`, body ≤ 100 kb, ningún `GET` muta, check de `Origin` en `POST`, `email` nunca expuesto ni logueado, `npm audit --audit-level=high` en CI |
| XVII | Robustez | ✅ | Config validada con zod al arrancar; graceful shutdown; timeout de request y de DB; salida ante errores no capturados |

### Principios CONDITIONAL

| # | Principio | ¿Disparador presente? | Decisión |
|---|---|---|---|
| III (acceso) / VII | Autenticación y tokens en cookie | No: el enunciado dice que no hace falta autenticación | No se implementa. El usuario viaja en la URL o el body. La cancelación igual verifica que la orden sea del `userId` enviado. HTTPS/HSTS (parte baseline de VII) vía `helmet` y el proxy |
| VIII | Llamadas a servicios externos | No: no hay mercado externo | Sin retry ni circuit breaker. `GET` idempotentes por diseño |
| IX | Operaciones no repetibles | **Sí**: enviar una orden mueve dinero | `Idempotency-Key` obligatoria, tabla `idempotency_keys` (R5) |
| X | Saga y outbox | No: una sola base de datos | Transacción local |
| XI (carga) | Requisito de throughput | No | Sin k6; solo tests de concurrencia |

**Resultado del gate**: PASS. Sin violaciones no justificadas.

## Architecture Recommendation

**Propuesta**: monolito en capas por feature, sin estado derivado persistido. Las posiciones y
saldos se recalculan desde `orders` en cada lectura y en cada envío, bajo un lock de fila por
usuario.

| | Propuesta: cálculo desde `orders` + lock por usuario | Alternativa: saldos y posiciones materializados |
|---|---|---|
| Fuente de verdad | Una (`orders`), como pide el enunciado | Dos (`orders` + tabla de saldos) que deben coincidir |
| Concurrencia | `SELECT ... FOR UPDATE` sobre `users` | `UPDATE` atómico del saldo (`WHERE balance >= x`) |
| Costo por request | Lee todas las órdenes del usuario (O(n) por usuario) | O(1) |
| Riesgo | Lento si un usuario acumula muchísimas órdenes | Desincronización y migración de datos históricos |
| Cambios de esquema | Solo `idempotency_keys` | Tablas nuevas + backfill |

Se elige la propuesta porque cumple el spec con menos piezas y respeta el enunciado ("usar
todos los movimientos de `orders`"). **Disparador para pasar a la alternativa**: que un test de
carga muestre el p95 del envío de órdenes por encima del objetivo para usuarios con miles de
órdenes.

## Pattern Decision (principio XIII)

| Feature | Decisión | Problema | Alternativa descartada |
|---|---|---|---|
| Envío de órdenes | **Strategy**: `MarketOrderStrategy` y `LimitOrderStrategy` implementan `OrderTypeStrategy { resolvePrice(input, lastPrice); initialStatus() }` | El tipo de orden cambia cómo se obtiene el precio (cierre vs límite), si el precio es obligatorio y el estado inicial (`FILLED` vs `NEW`). El mercado real suma tipos (STOP, etc.) | `if (type === 'MARKET')` repartido entre validación, precio y estado |
| Portfolio | Sin patrón adicional | Es una lectura más un cálculo puro; `computeHoldings` es una función | — |
| Cancelación | Sin patrón adicional | Hay una sola transición (`NEW → CANCELLED`); una guarda alcanza. Pasar a **State** si aparecen ejecuciones parciales o más transiciones | State con una sola transición |
| Búsqueda | Sin patrón adicional | Una query paginada | — |

## Project Structure

### Documentation (this feature)

```text
specs/001-portfolio-orders-api/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones R1–R13
├── data-model.md        # Fase 1: entidades, reglas de cálculo, ejemplo verificable
├── quickstart.md        # Fase 1: cómo levantar y validar
├── contracts/
│   └── openapi.yaml     # Fase 1: contrato de referencia de la API
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app.ts                         # composition root: createApp(config, dataSource)
├── server.ts                      # listen, graceful shutdown, errores no capturados
├── config.ts                      # env validado con zod (única lectura de process.env)
├── data-source.ts                 # DataSource de TypeORM (pool, timeouts)
├── migrations/
│   ├── 0001-baseline.ts           # esquema de database.sql (IF NOT EXISTS)
│   └── 0002-idempotency-keys.ts
├── shared/
│   ├── errors.ts                  # errores de dominio con code
│   ├── money.ts                   # decimal.js, formato "0.00" + ARS
│   ├── pagination.ts              # cursor keyset
│   ├── logger.ts
│   └── http/
│       ├── validate.ts            # middleware zod
│       ├── error-handler.ts       # → Problem Details
│       ├── request-timeout.ts
│       ├── origin-check.ts
│       └── openapi.ts             # registry + /docs
├── health/health.routes.ts
├── users/{user.entity.ts, users.repository.ts}
├── market-data/{market-data.entity.ts, market-data.repository.ts}
├── holdings/
│   ├── compute-holdings.ts        # función pura (R3)
│   └── compute-holdings.spec.ts
├── instruments/
│   ├── instrument.entity.ts
│   ├── instruments.{routes,controller,service,repository,schemas}.ts
│   └── instruments.service.spec.ts
├── orders/
│   ├── order.entity.ts
│   ├── idempotency-key.entity.ts
│   ├── order-type.strategy.ts     # Market / Limit
│   ├── orders.{routes,controller,service,repository,schemas}.ts
│   └── orders.service.spec.ts
└── portfolio/
    ├── portfolio.{routes,controller,service,schemas}.ts
    └── portfolio.service.spec.ts

test/
├── helpers/{test-app.ts, db.ts, factories.ts}
├── orders.functional.spec.ts      # test funcional de envío de orden (enunciado)
├── orders-concurrency.functional.spec.ts
├── cancellation.functional.spec.ts
├── portfolio.functional.spec.ts
└── instruments.functional.spec.ts

docker-compose.yml                 # postgres (+ base de test), ejecuta database.sql
requests.http                      # colección REST Client (nice to have del enunciado)
.env.example
```

**Structure Decision**: proyecto único de backend en la raíz del repo, organizado por feature
(principio II). `holdings` y `market-data` son módulos compartidos que usan `orders` y
`portfolio`, así ninguna feature importa a otra y no hay ciclos.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `orders.datetime` es `TIMESTAMP` sin zona (principio IV pide `timestamptz`) | Es el esquema heredado del challenge y su script de datos | Migrar a `timestamptz` cambia el esquema entregado; se mitiga escribiendo y leyendo siempre en UTC |
| Columnas en minúscula sin snake_case (`instrumentid`, `previousclose`) | Las crea así `database.sql` | Renombrarlas rompe el script de datos del challenge; las entidades mapean el nombre explícito |
| `UPDATE` de `status` en `orders` (principio IV: append-only) | El spec exige cancelar órdenes `NEW` sobre la misma fila | Un registro compensatorio no cabe en el modelo de `orders` del enunciado; el principio permite transiciones explícitas del spec |
| Migración baseline con `CREATE TABLE IF NOT EXISTS` | Debe convivir con una base ya creada por `database.sql` | Una baseline estricta fallaría sobre la base del challenge |

## Post-Design Constitution Re-check

Revisado contra `data-model.md`, `contracts/openapi.yaml` y `research.md`:

- **IX**: la clave se guarda en la misma transacción y bajo el mismo lock que la orden; el replay devuelve `200` con la orden original y la clave reusada con otro body devuelve `422`. Cumple.
- **XI**: el lock es por usuario, la transacción no hace llamadas de red y `lock_timeout` acota la espera (`409 CONCURRENT_REQUEST`). Cumple.
- **VI**: todos los endpoints del contrato tienen respuestas de error documentadas, montos como string con moneda y la búsqueda paginada. Cumple.
- **V**: ninguna tabla, índice o dependencia sin un requisito que la use. Cumple.

**Resultado**: PASS.
