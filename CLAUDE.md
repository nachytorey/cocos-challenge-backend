# cocos-challenge-backend

Backend del challenge de Cocos. Express 5 + TypeScript + PostgreSQL (TypeORM), como pide el enunciado (`fullstack-challenge.md`). Datos iniciales en `database.sql`.
El frontend (Next.js) vive en un repo aparte y consume esta API.

## Reglas

Las reglas no negociables están en `.specify/memory/constitution.md`. Leerla antes de planificar o implementar.

## Flujo (Spec Kit)

constitution → `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`

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

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
