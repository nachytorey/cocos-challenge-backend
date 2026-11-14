---
name: query-plan-check
description: Índices por defecto en las consultas calientes que filtran por clave foránea y receta para medir el plan con volumen (1M de filas) dentro de una transacción con ROLLBACK, más un test funcional con volumen. Usar al escribir queries sobre tablas que crecen (órdenes, movimientos, market data) o al revisar escalabilidad.
---

# Query plan check

Implementa el principio XI (índices) y el disparador de índices de `simplicity-first`. Nació de una medición real: la consulta de holdings con 1.000.000 de órdenes tardó **53,3 ms** con `Parallel Seq Scan` y **0,18 ms** con un índice `(userid, datetime, id)`. Casi 300 veces, por una migración de dos líneas.

## Regla 1: el índice se crea de entrada

Un índice sobre la columna con la que una consulta caliente filtra no es una optimización prematura: es el costo de modelar el acceso. Se crea **en la misma feature** que escribe la consulta, sin esperar a un `EXPLAIN` que muestre el problema.

Es consulta caliente si cumple alguna:

- Corre en cada request de un endpoint de lectura principal (p. ej. el portfolio).
- Corre **dentro de una transacción con un lock tomado** (p. ej. el envío de una orden): cada milisegundo ahí serializa a todos los demás requests del mismo usuario.
- Filtra una tabla que crece con el uso (órdenes, movimientos, precios históricos).

Las columnas `userid`, `instrumentid` y cualquier FK usada en un `WHERE` o `JOIN` de esas consultas se indexan. PostgreSQL **no** indexa las FK automáticamente.

## Regla 2: forma del índice

- Que cubra filtro **y** orden: `(userid, datetime, id)` para `WHERE userid = $1 ORDER BY datetime, id`.
- Para "último valor por grupo" (`DISTINCT ON`), el índice replica el `ORDER BY`: `(instrumentid, date DESC, id DESC)`.
- Un índice por consulta caliente; no indexar "por si acaso" columnas que nadie filtra.
- En una tabla heredada (esquema de `database.sql`), el índice va en una **migración nueva**, nunca reescribiendo la baseline. En tablas grandes de producción, `CREATE INDEX CONCURRENTLY` (fuera de transacción).
- La migración tiene `down` (`DROP INDEX`).

## Regla 3: medir el plan con volumen, sin ensuciar la base

Se mide en la base de **test**, dentro de una transacción que termina en `ROLLBACK`, así el volumen no queda:

```sql
BEGIN;
INSERT INTO users (email, accountnumber)
  SELECT 'u'||g||'@x.com', g::text FROM generate_series(1,10000) g;
INSERT INTO orders (instrumentid, userid, size, price, type, side, status, datetime)
  SELECT 47, (SELECT min(id) FROM users) + (g % 10000), 1, 900,
         'MARKET', 'BUY', 'FILLED', now() - (g || ' seconds')::interval
  FROM generate_series(1,1000000) g;
ANALYZE orders;

EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
  SELECT instrumentid, side, status, size, price FROM orders
   WHERE userid = (SELECT min(id)+5 FROM users) AND status IN ('FILLED','NEW')
   ORDER BY datetime, id;
ROLLBACK;
```

Con `docker exec -i <contenedor> psql -U <user> -d <base_test> -v ON_ERROR_STOP=1`. Nunca contra la base de desarrollo ni producción. Verificar al final que el conteo volvió al original.

Cómo leer el resultado:

| Plan | Veredicto |
|---|---|
| `Seq Scan` / `Parallel Seq Scan` en una tabla grande, filtrando por una columna | Falta índice |
| `Index Scan` / `Bitmap Index Scan` con `Execution Time` de ms o menos | Correcto |
| `Sort` grande sobre muchas filas | El índice no cubre el orden |

Para probar un índice candidato: crearlo **dentro del mismo `BEGIN`**, correr `ANALYZE` y repetir el `EXPLAIN`; el `ROLLBACK` lo descarta.

## Regla 5: un test funcional con volumen

Una feature que lee o escribe una tabla que crece trae **un** test funcional con volumen, sin esperar a un requisito de latencia declarado:

- Insertar en lote (`generate_series`, una sola sentencia) 100.000 filas de un usuario en la base de test.
- Ejecutar el endpoint caliente y verificar que responde correcto **y** dentro de un umbral holgado (p. ej. 1 s; la idea es atrapar un scan de órdenes de magnitud, no medir milisegundos finos).
- Limpiar con el `resetDb` del test (ver `db-seeding-fixtures`).

El smoke de k6 solo con `GET` y 11 filas no atrapa este problema: no cuenta como medición de volumen.

## Qué queda registrado en el plan

Una línea por consulta caliente: consulta, índice, y el `Execution Time` medido con volumen antes y después. Si se decide **no** indexar, el plan lo justifica con el plan de ejecución medido, no con "no hace falta con estos datos".

## Relación con otros skills

- `typeorm-postgres`: cómo se escribe la migración.
- `concurrency-and-load`: locks y k6.
- `db-seeding-fixtures`: factories y volumen para tests.
