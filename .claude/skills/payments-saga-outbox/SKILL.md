---
name: payments-saga-outbox
description: Idempotencia en pagos y transacciones, sagas con compensaciones y Transactional Outbox con Express + TypeORM + PostgreSQL. Usar al implementar pagos, transferencias, órdenes, reembolsos, publicación de eventos o flujos que cruzan servicios.
---

# Idempotencia, Saga y Outbox

Implementa los principios IX y X de la constitution. Ambos son **condicionales**:

- Idempotencia con clave: solo para operaciones cuya repetición causa daño (mover dinero, crear una orden, enviar una notificación).
- Saga y outbox: solo si la operación cruza más de un servicio, sistema externo o broker. Con una sola base de datos se usa una transacción local y nada más.

## Idempotencia en pagos/transacciones

Tabla `idempotency_keys`:

| columna | nota |
|---|---|
| `key` | **UNIQUE** (junto con scope/usuario) |
| `request_hash` | hash del payload canónico |
| `status` | `in_progress` / `completed` / `failed` |
| `response` | cuerpo + status code guardados |
| `created_at`, `expires_at` | TTL de limpieza |

Flujo:
1. `INSERT ... ON CONFLICT DO NOTHING` de la clave en estado `in_progress` (dentro de la transacción de negocio cuando se pueda).
2. Si la clave ya existía: mismo `request_hash` y `completed` → devolver la respuesta guardada; `in_progress` → `409`; hash distinto → `422`.
3. Ejecutar la operación y guardar resultado + `completed` **en la misma transacción** que el cambio de negocio.

Los consumidores de mensajes deduplican por `message_id` (tabla `processed_messages` con UNIQUE).

## Transactional Outbox

Nunca "escribir en DB y publicar directo" (dual write). En su lugar:

```ts
await this.dataSource.transaction(async (m) => {
  await m.save(order);                       // cambio de dominio
  await m.save(OutboxEvent, {                // misma transacción
    aggregateId: order.id, type: 'OrderCreated', payload, status: 'pending',
  });
});
```

Tabla `outbox_events`: `id`, `aggregate_id`, `type`, `payload` (jsonb), `status`, `created_at`, `published_at`, `attempts`.

Relay (worker aparte o proceso en background):
- Leer lotes con `SELECT ... WHERE status='pending' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT n` para poder correr varias instancias sin pisarse.
- Publicar al broker, marcar `published`. Entrega **at-least-once**: los consumidores deben ser idempotentes.
- Reintentos con backoff, límite de `attempts` y dead-letter para eventos que no salen.
- Limpiar eventos publicados antiguos.

## Saga

- Para operaciones que cruzan servicios o sistemas externos; sin transacciones distribuidas.
- Cada paso tiene una **acción compensatoria** (reservar stock → liberar stock; cobrar → reembolsar).
- Persistir el estado de la saga (`saga_instances`: `id`, `state`, `current_step`, `payload`, `error`) y avanzar con eventos del outbox.
- **Orquestada** (un coordinador decide los pasos; mejor para flujos de pago con orden estricto) vs **coreografiada** (servicios reaccionan a eventos; menos acoplamiento, más difícil de seguir). Recomendar una en el plan con trade-offs.
- Las compensaciones también son idempotentes y reintentables.
- Estados terminales claros (`completed`, `compensated`, `failed_needs_review`) y alerta para los que requieren intervención manual.

## Tests

- Mismo `Idempotency-Key` enviado N veces en paralelo → un solo efecto.
- Misma clave con payload distinto → `422`.
- Caída entre commit y publicación → el relay publica luego; sin evento perdido ni duplicado lógico.
- Fallo en el paso k de una saga → se ejecutan las compensaciones de los pasos 1..k-1.
