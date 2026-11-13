---
name: docker-ci
description: Dockerfile multi-stage, docker-compose con PostgreSQL y Redis, y pipeline de CI (lint, type-check, tests unit/e2e, build). Usar al preparar el entorno de ejecución, el README de arranque o la integración continua.
---

# Docker y CI

Objetivo: que cualquiera levante el proyecto con **un comando** y que ningún merge entre sin pasar las compuertas de calidad.

## Dockerfile (multi-stage)

- Etapa `build`: instalar dependencias, compilar TypeScript.
- Etapa final: imagen slim, solo dependencias de producción, usuario **no root**, `NODE_ENV=production`.
- Sin secretos en la imagen; todo por variables de entorno.
- `.dockerignore`: `node_modules`, `dist`, `.env`, `.git`.

## docker-compose (desarrollo y tests)

- Servicios: `api`, `postgres` (con healthcheck) y `redis` (solo si el plan lo justifica: rate limit multi-instancia o cache).
- `api` espera a que `postgres` esté sano (`depends_on: condition: service_healthy`).
- Volumen para los datos de Postgres; base separada para tests e2e.
- Comando de migraciones documentado: `npm run migration:run`.

## Pipeline de CI

Orden de jobs, cada uno bloquea el merge si falla:

1. Install con lockfile (`npm ci`).
2. Lint y type-check.
3. Unit tests.
4. e2e con Postgres (y Redis) como service containers y migraciones aplicadas.
5. Build.
6. Opcional: tests de carga k6 reducidos (smoke) en cada PR; los completos en un job manual o nocturno.

## README (obligatorio por la constitution)

Debe explicar: requisitos, `.env.example`, cómo levantar con compose, migraciones, seeds, tests, tests de carga y la URL de Swagger.

## Reglas

- Versiones fijadas (imágenes y dependencias); nada de `latest`.
- Cache de dependencias en CI para velocidad.
- Secretos solo desde el gestor de secretos del CI, nunca en el repo.
