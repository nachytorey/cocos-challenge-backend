# cocos-challenge-backend

Backend del challenge de Cocos. NestJS + TypeScript + PostgreSQL (TypeORM).
El frontend (Next.js) vive en un repo aparte y consume esta API.

## Reglas

Las reglas no negociables están en `.specify/memory/constitution.md`. Leerla antes de planificar o implementar.

## Flujo (Spec Kit)

constitution → `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`

## Skills de proyecto

- `nestjs-conventions`: arquitectura de módulos, DTOs, errores, Swagger.
- `typeorm-postgres`: entidades, migraciones, transacciones, numeric.
- `nestjs-testing`: test-first con Jest y Supertest.
- `auth-cookies`: token de sesión en cookie HttpOnly, logout y CORS.
- `api-resilience`: idempotencia, reintentos, circuit breaker y Swagger obligatorio.
- `payments-saga-outbox`: idempotencia en pagos, sagas con compensaciones y outbox.
- `rate-limiting`: throttler global con Redis, límites estrictos en rutas sensibles y 429.
- `error-contract`: formato único de errores (Problem Details) y catálogo de códigos.
- `observability`: logs estructurados, correlation id, health checks y métricas.
- `docker-ci`: Dockerfile, compose con Postgres/Redis y pipeline de CI.
- `db-seeding-fixtures`: seeds, factories y datos de volumen para tests de carga.
- `simplicity-first`: checklist para detectar sobreingeniería y disparadores para crecer.
- `design-patterns`: elegir, nombrar y justificar un patrón de diseño por feature.
- `concurrency-and-load`: locking, escala (miles de RPS) y tests de stress con k6.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
