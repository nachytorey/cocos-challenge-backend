---
name: typeorm-postgres
description: Reglas de acceso a datos con TypeORM y PostgreSQL (entidades, migraciones, transacciones, tipos numéricos). Usar al crear entidades, migraciones, queries o lógica que modifique varias filas.
---

# TypeORM + PostgreSQL

Reglas derivadas del principio IV de la constitution.

- Cambios de esquema SOLO por migraciones versionadas (`typeorm migration:generate` / `migration:run`). `synchronize: true` está prohibido.
- Revisar a mano cada migración generada antes de commitearla; debe tener `down` funcional.
- Montos y cantidades: columna `numeric(precision, scale)` explícita. En TS manejarlos como string o con una librería decimal; nunca `float`/`number` para dinero.
- Operaciones que tocan varias filas o tablas van dentro de una transacción (`DataSource.transaction` o `QueryRunner`).
- Índices explícitos para columnas usadas en filtros, joins y ordenamientos frecuentes. PostgreSQL **no** indexa las FK solo: `userid` e `instrumentid` en tablas que crecen llevan su índice en la migración de la misma feature. Forma y medición con volumen: skill `query-plan-check`.
- Las entidades no se exponen por la API; mapear a DTOs.
- Acceso a datos solo desde services vía repositorios inyectados.
- Evitar N+1: usar `relations`/`QueryBuilder` con joins deliberados.
- Preferir queries parametrizadas; nunca concatenar input del usuario en SQL.

## Timeouts de conexión

Configurar por variables de entorno, en `extra` del DataSource o por rol de base:

- `statement_timeout`: corta queries largas.
- `lock_timeout`: no esperar un lock indefinidamente.
- `idle_in_transaction_session_timeout`: corta transacciones abandonadas que retienen locks.

## Migraciones sin downtime

La versión anterior de la app sigue corriendo mientras se migra, así que cada cambio va en pasos (expandir → migrar → contraer):

- Agregar columna: primero nullable o con default; hacerla `NOT NULL` en una release posterior.
- Renombrar o borrar columna: agregar la nueva, escribir en ambas, migrar datos, dejar de leer la vieja y recién en otra release borrarla.
- Índices en tablas grandes: `CREATE INDEX CONCURRENTLY` (fuera de transacción).
- Si el proyecto parte de un esquema existente: capturarlo como **migración baseline**, no reescribirlo.

## Fechas y registros de auditoría

- Timestamps en `timestamptz`, siempre UTC.
- Registros con valor de auditoría (movimientos de dinero, órdenes, cambios de permisos) son **append-only**: se corrigen con un registro compensatorio nuevo, nunca con `UPDATE` o `DELETE`.
- Aritmética de montos en la app con `decimal.js`; TypeORM devuelve `numeric` como string, convertir con un transformer.
