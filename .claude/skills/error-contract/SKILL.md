---
name: error-contract
description: Formato único de errores de la API (Problem Details RFC 9457), catálogo de códigos y middleware de errores global de Express. Usar al lanzar excepciones, definir respuestas de error, documentar errores en Swagger o cuando el frontend necesite interpretar un error.
---

# Error contract

La API devuelve **siempre el mismo formato de error**, para que el frontend lo interprete sin adivinar. Implementa el principio XIV y complementa VI y XII.

## Formato (Problem Details)

`Content-Type: application/problem+json`

```json
{
  "type": "https://api.example.com/errors/validation-failed",
  "title": "Validation failed",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "amount must be a positive number",
  "errors": [{ "field": "amount", "message": "must be a positive number" }],
  "traceId": "c0ffee-..."
}
```

- `code`: identificador estable en MAYÚSCULAS que el frontend usa para decidir qué hacer. **Nunca** cambia aunque cambie el texto.
- `errors[]`: solo en validación, un item por campo.
- `traceId`: el correlation id del request (ver skill `observability`).
- Nunca incluir stack traces, SQL ni datos internos en la respuesta; eso va al log.

## Catálogo mínimo

| Status | code | Cuándo |
|---|---|---|
| 400 | `VALIDATION_FAILED` | DTO inválido |
| 401 | `UNAUTHENTICATED` | Sin token o token inválido/expirado |
| 403 | `FORBIDDEN` | Autenticado pero sin acceso al recurso |
| 404 | `NOT_FOUND` | Recurso inexistente |
| 409 | `CONFLICT` / `IDEMPOTENCY_IN_PROGRESS` | Conflicto de estado o clave en curso |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Misma clave con payload distinto |
| 429 | `RATE_LIMITED` | Límite superado (con `Retry-After`) |
| 503 | `DEPENDENCY_UNAVAILABLE` | Breaker abierto (con `Retry-After`) |
| 500 | `INTERNAL_ERROR` | Error no previsto (mensaje genérico) |

## Implementación

- Un middleware de errores de Express (`(err, req, res, next)`), registrado al final, convierte toda excepción a este formato. Express 5 le hace llegar los errores de handlers `async`.
- Errores de validación de zod → `400 VALIDATION_FAILED`, con un item de `errors[]` por cada issue (`path` → `field`).
- Errores de dominio: clases propias (`InsufficientFundsError`) mapeadas a status + `code` en el filter; los services no conocen HTTP.
- Errores de TypeORM (`23505` unique, `40001/40P01` serialization/deadlock) se traducen a `CONFLICT` o se reintentan; nunca se filtran crudos.
- Documentar en OpenAPI los errores de cada endpoint con un schema zod compartido (`ProblemDetails`) registrado en el registry, una respuesta por cada status posible.

## Tests

- e2e: cada error del catálogo que el endpoint puede producir devuelve el formato y el `code` esperados.
- e2e: un error inesperado devuelve `INTERNAL_ERROR` sin detalles internos.
