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
- Índices explícitos para columnas usadas en filtros, joins y ordenamientos frecuentes.
- Las entidades no se exponen por la API; mapear a DTOs.
- Acceso a datos solo desde services vía repositorios inyectados.
- Evitar N+1: usar `relations`/`QueryBuilder` con joins deliberados.
- Preferir queries parametrizadas; nunca concatenar input del usuario en SQL.
