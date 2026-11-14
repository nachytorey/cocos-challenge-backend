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

## Qué va en la entrega (challenge o proyecto evaluado por terceros)

Quien abre el repo tiene que ver **el producto**, no el proceso con el que se hizo. Regla de proporción: el material de proceso (skills, constitution, specs, plan, tasks) no debe superar al código de producción.

- Va en la raíz y visible: código, tests, `README.md` con decisiones y suposiciones, `.env.example`, colección de requests, `docker-compose.yml`.
- Se resume en una sola carpeta (p. ej. `docs/`) o queda fuera de la entrega: skills de agente, constitution, `tasks.md`, checklists y research.
- El README enlaza solo lo que un lector necesita (la decisión y su motivo), no el historial del proceso.

## Reglas

- Versiones fijadas (imágenes y dependencias); nada de `latest`.
- Cache de dependencias en CI para velocidad.
- Secretos solo desde el gestor de secretos del CI, nunca en el repo.
