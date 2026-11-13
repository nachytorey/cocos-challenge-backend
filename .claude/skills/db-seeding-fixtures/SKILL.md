---
name: db-seeding-fixtures
description: Seeds, fixtures y factories de datos para desarrollo, tests e2e y tests de carga con PostgreSQL/TypeORM. Usar al preparar datos de prueba, aislar tests o generar volumen realista para k6.
---

# Seeding y fixtures

## Seeds de desarrollo

- Script idempotente (`npm run seed`): se puede correr varias veces sin duplicar (`upsert` / `ON CONFLICT DO NOTHING`).
- Datos mínimos y realistas; nunca datos reales ni personales.
- Separado de las migraciones: las migraciones cambian el esquema, los seeds cargan datos.

## Factories para tests

- Una factory por entidad (`buildUser()`, `buildOrder({ amount })`) con valores por defecto válidos y overrides explícitos; cada test crea lo que necesita.
- Montos con tipo decimal, nunca float.
- Nada de fixtures compartidos mutables entre tests.

## Aislamiento en e2e

- Base de datos de test separada, con migraciones aplicadas al inicio.
- Limpiar entre tests (`TRUNCATE ... RESTART IDENTITY CASCADE`) o envolver cada test en una transacción con rollback.
- Los tests no dependen del orden ni de datos que dejó otro.

## Volumen para carga (k6)

- Script aparte (`npm run seed:load`) que genera miles o millones de filas con `generate_series` o inserts por lotes, para que `EXPLAIN` y los índices se comporten como en producción.
- Distribución realista: unos pocos recursos muy calientes y muchos fríos, para provocar contención de locks.
- Siempre contra una base de test, nunca producción.

## Concurrencia

- Preparar escenarios con el **mismo recurso** (misma cuenta, mismo stock) para los tests de concurrencia (`Promise.all`) y verificar el invariante después.
