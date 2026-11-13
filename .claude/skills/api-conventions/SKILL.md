---
name: api-conventions
description: Convenciones REST de la API (nombres de recursos, status codes, paginación, orden, filtros, fechas en UTC, montos como string). Usar al diseñar o implementar cualquier endpoint, DTO de respuesta o listado.
---

# API conventions

Implementa la parte de convenciones del principio VI. **Un solo esquema para toda la API**: el frontend aprende una vez cómo paginar, ordenar y leer montos.

## Recursos y status codes

- Sustantivos en plural, sin verbos: `/v1/orders`, `/v1/orders/{id}`. Acciones que no son CRUD: sub-recurso (`POST /v1/orders/{id}/cancellation`).
- `GET` 200 · `POST` que crea 201 con header `Location` · operación sin cuerpo 204 · asíncrona 202.
- Nunca un `GET` que cambia estado (principio XVI).
- Errores: ver skill `error-contract`.

## Formato de datos

- JSON en `camelCase`.
- **Fechas**: ISO 8601 en UTC (`2026-11-13T19:45:00Z`). El frontend convierte a zona local.
- **Montos**: string decimal más moneda ISO 4217, nunca número JSON:

```json
{ "amount": "1234.50", "currency": "ARS" }
```

- Ids como string (UUID). Enums como strings en MAYÚSCULAS, documentados en Swagger.
- Campos ausentes: omitir o `null` de forma consistente; no mezclar.

## Paginación

Todo listado está paginado con `limit` acotado (default 20, máximo 100, validado en el DTO).

- **Por cursor (default)** para colecciones grandes o que crecen: `?limit=20&cursor=<opaco>`. El cursor codifica la clave de orden (keyset), no un offset.
- **Por offset** solo para colecciones chicas y estables, si el plan lo justifica.

Respuesta única para todos los listados:

```json
{ "data": [], "page": { "nextCursor": "abc", "hasMore": true } }
```

## Orden y filtros

- Orden: `?sort=createdAt,-amount` (`-` descendente). Solo campos de una lista blanca, con índice que lo soporte; siempre con desempate por id para que el cursor sea estable.
- Filtros: parámetros con nombre de campo (`?status=PENDING&createdFrom=...`), definidos y validados en un DTO de query. Nunca pasar filtros del cliente directo al ORM.
- Campo desconocido en `sort` o filtro → `400 VALIDATION_FAILED`.

## Swagger

Documentar en cada listado los parámetros `limit`, `cursor`, `sort` y los filtros, con un DTO genérico de página reutilizable.

## Tests

- e2e: `limit` mayor al máximo se rechaza; recorrer todas las páginas no repite ni pierde elementos aunque se inserten filas en el medio.
- e2e: `sort` o filtro fuera de la lista blanca devuelve 400.
- e2e: los montos salen como string y las fechas en UTC.
