---
name: concurrency-and-load
description: Diseño para miles de requests por segundo, estrategias de locking y concurrencia en PostgreSQL/TypeORM, y tests de stress/carga con k6. Usar al diseñar o implementar cualquier cosa con estado compartido, saldos, stock, colas, endpoints calientes o al elegir arquitectura.
---

# Concurrencia, locking y carga

Implementa el principio XI: **preparado para escalar, no construido para escalar**. El diseño nunca debe impedir llegar a miles de RPS (stateless, paginación, transacciones cortas, locking correcto), pero cache, colas y réplicas se agregan solo con un disparador medido o declarado (ver `simplicity-first`).

- Tests de concurrencia: obligatorios si la feature toca estado compartido mutable.
- Tests de stress con k6: obligatorios si el spec declara un requisito de throughput o latencia.
- Elegir siempre la estrategia de locking más simple que sea correcta (empezar por UPDATE atómico).

## En cada plan (obligatorio)

1. Carga esperada (RPS pico, lecturas vs escrituras, tamaño de datos).
2. Estado compartido mutable identificado (saldos, stock, contadores, estados de orden).
3. Estrategia de concurrencia elegida por cada uno, con aislamiento y alcance de transacción justificados.
4. **Recomendación de arquitectura** con al menos una alternativa y sus trade-offs.

## Estrategias de locking

| Caso | Estrategia |
|---|---|
| Conflictos poco frecuentes | **Optimista**: columna `version` (`@VersionColumn()`), reintentar ante conflicto |
| Conflictos frecuentes sobre la misma fila (saldo, stock) | **Pesimista**: `SELECT ... FOR UPDATE` (`setLock('pessimistic_write')`) |
| Contadores / saldos simples | **UPDATE atómico**: `SET balance = balance - $1 WHERE id = $2 AND balance >= $1` y verificar `affected` |
| Colas / jobs / outbox | `FOR UPDATE SKIP LOCKED` |
| Exclusión entre procesos | Advisory locks (`pg_advisory_xact_lock`) |

Reglas:
- Transacciones **cortas**; sin llamadas de red ni espera de usuario dentro.
- Adquirir locks **siempre en el mismo orden** (p. ej. por id ascendente) para evitar deadlocks.
- Manejar deadlock/serialization failure (`40P01`, `40001`) con reintento acotado.
- Nunca el patrón leer-modificar-escribir en la app sin lock o versión (lost update).
- Aislamiento por defecto `READ COMMITTED`; subir a `SERIALIZABLE` solo con motivo y con reintentos.
- Constraints únicos y checks en la DB como última defensa (no confiar solo en validación de app).

## Escala

- API **stateless** (sin sesión en memoria) para escalar horizontalmente.
- Pool de conexiones dimensionado a propósito (`extra.max` en TypeORM) considerando instancias × pool ≤ `max_connections`; evaluar PgBouncer.
- Paginación en todo listado, preferir keyset a offset en tablas grandes.
- Índices para filtros y orden frecuentes; revisar con `EXPLAIN ANALYZE`.
- Cache (Redis) en lecturas calientes con invalidación definida.
- Trabajo pesado o lento a colas/workers; el request responde rápido.
- Rate limiting (`express-rate-limit`) para proteger la API.

## Tests de stress y concurrencia

- **Concurrencia** (Jest): lanzar N operaciones en paralelo (`Promise.all`) sobre el mismo recurso y afirmar el invariante (saldo nunca negativo, stock no sobrevendido, un solo ganador).
- **Carga/stress** con **k6** en `test/load/*.js`: escenarios ramp-up, pico y soak, con thresholds, por ejemplo:

```js
export const options = {
  stages: [{ duration: '1m', target: 1000 }, { duration: '3m', target: 1000 }],
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<300', 'p(99)<800'] },
};
```

- Registrar resultados (RPS, p95/p99, tasa de error) y el entorno en el plan o PR.
- Ejecutar contra una DB de test con volumen de datos realista, nunca contra producción.
