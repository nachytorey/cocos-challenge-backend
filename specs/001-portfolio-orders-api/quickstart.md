# Quickstart: validación de la feature 001

Guía para levantar la API y comprobar que cumple el spec. Contratos en
[contracts/openapi.yaml](contracts/openapi.yaml); reglas de cálculo en
[data-model.md](data-model.md).

## Requisitos

- Node.js 24 LTS y npm.
- Docker con Docker Compose.

## Levantar

```bash
cp .env.example .env
docker compose up -d postgres          # crea la base y ejecuta database.sql
npm ci
npm run migration:run                  # baseline (no-op) + idempotency_keys
npm run dev                            # API en http://localhost:3000
```

Swagger UI: `http://localhost:3000/docs`. Colección de requests: `requests.http` (REST Client).

## Compuertas de calidad

```bash
npm run lint && npm run typecheck && npm run check:cycles
npm test                               # unit con cobertura
npm run test:functional                # HTTP contra la base de test
```

Todas deben pasar. La cobertura de la lógica de negocio debe ser ≥ 80%.

## Escenarios de validación (con los datos de `database.sql`)

### 1. Portfolio del usuario 1 (US2, SC-004)

`GET /v1/users/1/portfolio` → `200` con:

| Campo | Valor esperado |
|---|---|
| `availableCash.amount` | `627500.00` |
| `reservedCash.amount` | `125500.00` |
| `totalAccountValue.amount` | `904784.00` |
| Posición 47 | `quantity` 40, `marketValue` `37034.00`, `totalReturnPct` `-0.45`, `dailyReturnPct` `0.44` |
| Posición 54 | `quantity` 500, `marketValue` `114750.00`, `totalReturnPct` `-8.20`, `dailyReturnPct` `-1.08` |
| Instrumento 31 | No aparece (cantidad −10 en los datos semilla) |

### 2. Orden MARKET por cantidad (US1, escenario 1)

`POST /v1/orders` con `Idempotency-Key: k-market-1` y
`{ "userId": 1, "instrumentId": 47, "side": "BUY", "type": "MARKET", "quantity": 10 }`
→ `201`, `status` `FILLED`, `price.amount` `925.85`. El portfolio muestra 50 acciones del 47 y
`availableCash` 9.258,50 menos.

### 3. Mismo envío repetido (SC-003)

Repetir exactamente el request 2 → `200` con la misma orden (mismo `id`); en la base sigue
habiendo una sola orden nueva. Mismo header con otro body → `422 IDEMPOTENCY_KEY_REUSED`.

### 4. Orden LIMIT por monto (US1, escenarios 2 y 5)

`{ "userId": 1, "instrumentId": 47, "side": "BUY", "type": "LIMIT", "amount": "5000", "price": "900" }`
→ `201`, `status` `NEW`, `quantity` 5. `reservedCash` sube 4.500,00 y `totalAccountValue` no cambia.

### 5. Fondos o acciones insuficientes (US1, escenarios 3 y 4)

- Compra MARKET de 10.000 acciones del 47 → `201`, `status` `REJECTED`; el saldo no cambia.
- Venta de 100 acciones del 54 sobre 500 en tenencia → `FILLED`; venta de 1.000 → `REJECTED`.

### 6. Datos inválidos (US1, escenarios 6 y 7)

- LIMIT sin `price` → `400 VALIDATION_FAILED`, no se registra.
- `quantity` y `amount` juntos, o ninguno → `400`.
- `amount: "100"` sobre el 47 (precio 925,85) → `422 ZERO_QUANTITY`.
- `instrumentId: 66` (ARS) con `BUY` → `400`.

### 7. Cancelación (US4)

- Orden `NEW` del escenario 4 → `POST /v1/orders/{id}/cancellation` `{ "userId": 1 }` → `200`
  `CANCELLED`; la reserva desaparece del portfolio.
- Repetir la cancelación → `409 ORDER_NOT_CANCELLABLE`.
- Con `userId: 2` → `404`.

### 8. Búsqueda (US3)

- `GET /v1/instruments?q=pam` → incluye `PAMP`.
- `GET /v1/instruments?q=pampa` → incluye los que tienen "Pampa" en el nombre.
- `GET /v1/instruments?q=zzzz` → `data: []`.
- `GET /v1/instruments?q=` → `400`.
- `GET /v1/instruments?q=s&limit=5` → 5 resultados y `nextCursor`; recorrer las páginas no repite elementos.

### 9. Concurrencia (SC-002)

El test funcional de concurrencia crea un usuario con un `CASH_IN` igual al costo exacto de 10
compras (p. ej. precio 100, 1 acción por orden, `CASH_IN` de 1.000) y envía 20 compras MARKET
simultáneas con claves distintas: exactamente 10 quedan `FILLED`, 10 `REJECTED`, y
`availableCash` termina en `0.00`, nunca negativo. Lo mismo con 20 ventas simultáneas sobre una
tenencia de 10 acciones.
