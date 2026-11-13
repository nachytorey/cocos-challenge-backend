# Data Model: Portfolio, búsqueda de activos y envío de órdenes

**Feature**: `001-portfolio-orders-api` | **Date**: 2026-11-13

Las tablas `users`, `instruments`, `orders` y `marketdata` son heredadas de `database.sql` y no se modifican. La única tabla nueva es `idempotency_keys`. Los nombres de columna reales están en minúscula porque el script los crea sin comillas.

## Entidades persistidas

### User — tabla `users` (heredada)

| Campo (entidad) | Columna | Tipo | Notas |
|---|---|---|---|
| `id` | `id` | `SERIAL` PK | |
| `email` | `email` | `VARCHAR(255)` | Dato personal: no se loguea ni se devuelve en la API |
| `accountNumber` | `accountnumber` | `VARCHAR(20)` | |

### Instrument — tabla `instruments` (heredada)

| Campo | Columna | Tipo | Notas |
|---|---|---|---|
| `id` | `id` | `SERIAL` PK | |
| `ticker` | `ticker` | `VARCHAR(10)` | Buscable (case-insensitive) |
| `name` | `name` | `VARCHAR(255)` | Buscable (case-insensitive) |
| `type` | `type` | `VARCHAR(10)` | `ACCIONES` o `MONEDA`. `MONEDA` (ARS) representa los pesos |

Reglas: el instrumento `MONEDA` no se opera con `BUY`/`SELL` y no aparece en la búsqueda.

### Order — tabla `orders` (heredada)

| Campo | Columna | Tipo | Notas |
|---|---|---|---|
| `id` | `id` | `SERIAL` PK | |
| `instrumentId` | `instrumentid` | `INT` FK → `instruments` | |
| `userId` | `userid` | `INT` FK → `users` | |
| `size` | `size` | `INT` | Acciones enteras; para `CASH_IN`/`CASH_OUT`, monto en pesos |
| `price` | `price` | `NUMERIC(10,2)` | Precio de ejecución o límite; `1` en movimientos de pesos |
| `type` | `type` | `VARCHAR(10)` | `MARKET` · `LIMIT` |
| `side` | `side` | `VARCHAR(10)` | `BUY` · `SELL` · `CASH_IN` · `CASH_OUT` |
| `status` | `status` | `VARCHAR(20)` | `NEW` · `FILLED` · `REJECTED` · `CANCELLED` |
| `datetime` | `datetime` | `TIMESTAMP` (sin zona) | Se escribe y se lee siempre en UTC |

Validaciones al crear (vía API):

- `side` ∈ {`BUY`, `SELL`}. `CASH_IN`/`CASH_OUT` no se crean por API.
- Exactamente uno de `quantity` (entero > 0) o `amount` (decimal > 0, máx. 2 decimales).
- `type = LIMIT` → `price` obligatorio, decimal > 0, máx. 2 decimales. `type = MARKET` → `price` no se envía.
- Con `amount`: `size = floor(amount / precio)`; si da 0 → `422 ZERO_QUANTITY`, no se registra.
- `price` guardado: `close` vigente (MARKET, redondeado a 2 decimales) o el precio límite (LIMIT).

Transiciones de estado:

```text
            ┌──────────── MARKET con saldo ───────────► FILLED
 (envío) ───┼──────────── LIMIT con saldo ────────────► NEW ──── cancelación ───► CANCELLED
            └──────────── sin pesos / sin acciones ───► REJECTED
```

- Solo `NEW → CANCELLED` es una transición posterior a la creación (único `UPDATE` permitido, principio IV).
- `NEW → FILLED` existe en el dominio pero no ocurre en esta feature (no se simula el mercado).
- `FILLED`, `REJECTED` y `CANCELLED` son estados finales.

### MarketData — tabla `marketdata` (heredada)

| Campo | Columna | Tipo | Notas |
|---|---|---|---|
| `id` | `id` | `SERIAL` PK | |
| `instrumentId` | `instrumentid` | `INT` FK | |
| `high`, `low`, `open` | `high`, `low`, `open` | `NUMERIC(10,2)` | Pueden ser `NULL` |
| `close` | `close` | `NUMERIC(10,2)` | Último precio del día |
| `previousClose` | `previousclose` | `NUMERIC(10,2)` | Cierre del día anterior |
| `date` | `date` | `DATE` | Una fila por instrumento y día |

Último precio: `close` de la fila con mayor `date` (desempate por `id`).

### IdempotencyKey — tabla `idempotency_keys` (nueva, migración `0002`)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `SERIAL` PK | |
| `user_id` | `INT` NOT NULL FK → `users` | Alcance de la clave |
| `key` | `VARCHAR(255)` NOT NULL | Valor del header `Idempotency-Key` |
| `request_hash` | `CHAR(64)` NOT NULL | SHA-256 del body canónico |
| `order_id` | `INT` NOT NULL FK → `orders` | Orden creada |
| `response_status` | `SMALLINT` NOT NULL | Status HTTP devuelto (`201`) |
| `response_body` | `JSONB` NOT NULL | Respuesta original, para los replays |
| `created_at` | `TIMESTAMPTZ` NOT NULL DEFAULT `now()` | |

Restricción: `UNIQUE (user_id, key)`. Se escribe en la misma transacción que la orden.

## Modelos derivados (no se persisten)

### Holdings — salida de `computeHoldings(orders)`

| Campo | Tipo | Regla |
|---|---|---|
| `cashBalance` | decimal | `CASH_IN` − `CASH_OUT` − compras `FILLED` + ventas `FILLED` |
| `reservedCash` | decimal | Σ `size × price` de compras `NEW` |
| `availableCash` | decimal | `cashBalance − reservedCash` |
| `positions[instrumentId]` | ver abajo | |

Por instrumento:

| Campo | Tipo | Regla |
|---|---|---|
| `quantity` | entero | Σ compras `FILLED` − Σ ventas `FILLED` |
| `reservedQuantity` | entero | Σ ventas `NEW` |
| `availableQuantity` | entero | `quantity − reservedQuantity` |
| `averageCost` | decimal | Promedio ponderado de compras; se reinicia si `quantity` llega a ≤ 0 |

### Position (respuesta de portfolio)

Solo instrumentos con `quantity > 0`.

| Campo | Regla |
|---|---|
| `quantity` | De holdings |
| `marketValue` | `quantity × close`; `null` si el instrumento no tiene precio |
| `totalReturnPct` | `(close − averageCost) / averageCost × 100`; `null` si falta precio |
| `dailyReturnPct` | `(close − previousClose) / previousClose × 100`; `null` si falta o es 0 |

### Portfolio

| Campo | Regla |
|---|---|
| `availableCash` | De holdings |
| `reservedCash` | De holdings |
| `totalAccountValue` | `cashBalance` + Σ `marketValue` (las posiciones sin precio no suman) |
| `positions` | Lista de Position, ordenada por ticker |

## Ejemplo verificable (usuario 1 de `database.sql`)

| Concepto | Valor |
|---|---|
| `cashBalance` | 1.000.000 − 46.500 + 9.400 − 100.000 − 30.800 − 125.000 + 45.900 = **753.000,00** |
| `reservedCash` | 50 × 710 + 60 × 1.500 = **125.500,00** |
| `availableCash` | **627.500,00** |
| Posición 47 | 40 acciones, costo 930, cierre 925,85 → valor **37.034,00** |
| Posición 54 | 500 acciones, costo 250, cierre 229,50 → valor **114.750,00** |
| Instrumento 31 | cantidad −10 (anomalía de datos, R8) → no se lista |
| `totalAccountValue` | 753.000 + 37.034 + 114.750 = **904.784,00** |
