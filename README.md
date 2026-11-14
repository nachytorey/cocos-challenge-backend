# cocos-challenge-backend

API REST para consultar el portfolio de un usuario, buscar activos y enviar órdenes de compra o
venta al mercado (MARKET y LIMIT). Express 5 + TypeScript + TypeORM sobre PostgreSQL, como pide
[el enunciado](fullstack-challenge.md). Los datos iniciales están en [database.sql](database.sql).

- **Documentación interactiva:** `http://localhost:3000/docs/` (Swagger UI) y `/docs-json` (OpenAPI 3.1).
- **Colección de requests:** [requests.http](requests.http) (extensión REST Client de VS Code).
- **Especificación, plan y tareas:** [specs/001-portfolio-orders-api/](specs/001-portfolio-orders-api/).

## Endpoints

| Método y ruta                            | Qué hace                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/users/{userId}/portfolio`       | Pesos disponibles y reservados, valor total de la cuenta y posiciones (cantidad, valor de mercado, rendimiento total y retorno diario) |
| `GET /v1/instruments?q=&limit=&cursor=`  | Busca activos por ticker o nombre, paginado por cursor                                                                                 |
| `POST /v1/orders`                        | Envía una orden de compra o venta (MARKET o LIMIT, por cantidad o por monto). Requiere el header `Idempotency-Key`                     |
| `POST /v1/orders/{orderId}/cancellation` | Cancela una orden en estado `NEW`                                                                                                      |
| `GET /health/live`, `GET /health/ready`  | Liveness y readiness                                                                                                                   |

Los importes salen como string decimal con moneda (`{ "amount": "627500.00", "currency": "ARS" }`),
las fechas en ISO 8601 UTC y los errores en formato Problem Details (`application/problem+json`)
con un `code` estable.

## Requisitos

- Node.js 24 y npm.
- Docker (para PostgreSQL).
- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) solo si querés correr el smoke de latencia (`brew install k6`).

## Cómo levantarlo

```bash
cp .env.example .env                 # configuración local
docker compose up -d postgres        # crea la base `cocos` (con database.sql) y `cocos_test`
npm ci
npm run migration:run                # tabla idempotency_keys (la baseline es un no-op)
npm run dev                          # http://localhost:3000
```

Si tu Docker no tiene el plugin de Compose, este comando es equivalente:

```bash
docker run -d --name cocos-postgres -e POSTGRES_USER=cocos -e POSTGRES_PASSWORD=cocos \
  -e POSTGRES_DB=cocos -p 5432:5432 -v cocos-pgdata:/var/lib/postgresql/data \
  -v "$PWD/database.sql:/docker-entrypoint-initdb.d/01-database.sql:ro" \
  -v "$PWD/docker/init-test-db.sql:/docker-entrypoint-initdb.d/02-init-test-db.sql:ro" \
  postgres:16.6
```

Los scripts de `/docker-entrypoint-initdb.d/` solo corren al crear el volumen por primera vez. Para
empezar de cero: `docker volume rm cocos-pgdata`.

Si el puerto 3000 está ocupado, la API sale con el mensaje `Port 3000 is already in use` (código 1):
cambiá `PORT` en `.env`.

### Producción

`NODE_ENV=production` no carga `.env`: todas las variables vienen del entorno y la API falla al
arrancar, con un mensaje claro, si falta alguna requerida. Además:

- Rechaza con `403 HTTPS_REQUIRED` todo request que no llegue por TLS. Detrás de un proxy, poné
  `TRUST_PROXY=1` para que lea `X-Forwarded-Proto`.
- Envía HSTS y no expone `/docs`.

```bash
npm run build && npm start
```

## Configuración

Todas las variables están en [.env.example](.env.example) y se validan al arrancar. Las principales:

| Variable                                        | Default         | Para qué                                                 |
| ----------------------------------------------- | --------------- | -------------------------------------------------------- |
| `DATABASE_URL`                                  | (requerida)     | Base de datos de la aplicación                           |
| `DATABASE_URL_TEST`                             |                 | Base de los tests funcionales (nunca la de desarrollo)   |
| `PORT`                                          | `3000`          | Puerto HTTP                                              |
| `CORS_ORIGINS`                                  |                 | Orígenes permitidos, separados por coma                  |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`       | `300` / `60000` | Límite global por IP y ventana                           |
| `ORDERS_RATE_LIMIT_MAX`                         | `30`            | Límite más estricto en `POST /v1/orders` y cancelaciones |
| `REQUEST_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`     | `10000`         | Timeout de request y de apagado ordenado                 |
| `DB_STATEMENT_TIMEOUT_MS`, `DB_LOCK_TIMEOUT_MS` | `5000`          | Ninguna query ni lock espera indefinidamente             |

## Tests y compuertas de calidad

```bash
npm run lint && npm run typecheck && npm run check:cycles
npm test                  # unit, con umbral de cobertura (80% líneas y ramas)
npm run test:functional   # HTTP contra la base cocos_test
npm run test:load         # smoke de latencia con k6 (la API tiene que estar levantada)
```

Los tests funcionales cargan los datos de `database.sql` en `cocos_test` y verifican, entre otras
cosas, el portfolio del usuario 1 al centavo, la idempotencia, la cancelación y la concurrencia.
**El test funcional del envío de órdenes que pide el enunciado** es
[test/orders.functional.spec.ts](test/orders.functional.spec.ts).

### Latencia (SC-005: p95 < 1 s)

Medido contra el build de producción, con 10 usuarios virtuales durante 30 s sobre portfolio y
búsqueda, en la misma máquina que la base y con `RATE_LIMIT_MAX=100000` (el limiter se prueba
aparte, en los tests funcionales):

| Requests | RPS    | Errores | p50    | p95    | p99     |
| -------- | ------ | ------- | ------ | ------ | ------- |
| 82.143   | ~2.738 | 0%      | 3,2 ms | 6,6 ms | 11,1 ms |

Esta medición se hizo con un script de Node equivalente, porque `k6` no estaba instalado. El smoke
oficial es [test/load/portfolio-search.k6.js](test/load/portfolio-search.k6.js) y falla si el p95
supera 1 s. Es una medición de humo con 4 usuarios y 66 instrumentos, no una prueba de capacidad.

### Hooks de Git (Husky)

`npm ci` (o `npm install`) los instala solo, con el script `prepare`: no hay que hacer nada más.

| Hook         | Qué corre                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | `lint-staged` sobre lo que está preparado para commitear (ESLint con `--fix` y sin warnings, y Prettier) y después `npm run typecheck` |
| `pre-push`   | `npm run check:cycles` y `npm test` (unit tests con el umbral de cobertura)                                                            |

Son un filtro rápido y local. Los tests funcionales y la auditoría de dependencias no corren acá,
porque necesitan la base de datos o la red: los corre el CI.

Para saltearlos de forma excepcional: `git commit --no-verify`, `git push --no-verify` o
`HUSKY=0 git commit ...`. Eso no evita la verificación: el CI
([.github/workflows/ci.yml](.github/workflows/ci.yml)) corre todas las compuertas y es la obligatoria.

## Suposiciones y decisiones de diseño

Detalle completo en [spec.md](specs/001-portfolio-orders-api/spec.md) y
[research.md](specs/001-portfolio-orders-api/research.md).

**Cálculo de saldos y posiciones**

- Pesos y posiciones **no se guardan**: se derivan siempre de la tabla `orders` con una única función
  pura (`computeHoldings`), como pide el enunciado. `CASH_IN` suma, `CASH_OUT` resta, las compras y
  ventas `FILLED` mueven pesos y acciones.
- **Las órdenes `NEW` reservan**: una compra reserva `cantidad × precio límite` y una venta reserva
  sus acciones. El portfolio muestra los pesos reservados aparte y el valor total no cambia.
  Cancelar una orden libera la reserva.
- **Rendimiento**: `rendimiento total` es contra el costo promedio ponderado de compra, y
  `retorno diario` es `(close − previousClose) / previousClose`. Ambos salen `null` si falta el precio.
- Una posición sin precio de mercado se lista con `marketValue` en `null` y no suma al valor total.
- El último precio es el `close` de la fecha más reciente de `marketdata`.

**Envío de órdenes**

- MARKET se ejecuta al último cierre y queda `FILLED`. LIMIT queda `NEW` con el precio enviado (no se
  simula el mercado). Con un monto en pesos, la cantidad es `floor(monto / precio)`, sin fracciones.
- `REJECTED` es una orden **registrada** a la que le faltan pesos o acciones. Un pedido inválido o no
  procesable (datos mal formados, sin precio de mercado, monto que no alcanza para una acción) **no
  genera ninguna orden** y responde `400`, `404` o `422`.
- `currency` es obligatorio en el body (solo `ARS`): los montos siempre viajan con su moneda.

**Concurrencia e idempotencia**

- Cada envío o cancelación corre en una transacción que **bloquea la fila del usuario**
  (`SELECT ... FOR UPDATE`). Las órdenes de un mismo usuario se serializan, así el saldo nunca queda
  negativo; usuarios distintos no se bloquean entre sí. Hay un test que lanza 20 compras simultáneas
  sobre un saldo para 10 y verifica que exactamente 10 se ejecutan.
- `POST /v1/orders` exige `Idempotency-Key`. La clave se guarda en la misma transacción que la orden
  con el hash del body (claves ordenadas): repetir el envío devuelve la orden original (`200`) y la
  misma clave con otro body da `422 IDEMPOTENCY_KEY_REUSED`.

**Alcance**

- Sin autenticación, como indica el enunciado: el usuario viaja en la URL o en el body. Por eso no hay
  cookies de sesión ni guard de usuarios.
- Crear transferencias (`CASH_IN`/`CASH_OUT`) por API queda fuera de alcance: se usan las que ya
  están en los datos. Tampoco hay comisiones ni impuestos.

**Esquema heredado**

- El esquema de `database.sql` se respeta: se captura como migración baseline (no-op sobre la base ya
  creada) y solo se agrega la tabla `idempotency_keys`.
- Desvíos aceptados: `orders.datetime` es `TIMESTAMP` sin zona (se escribe y se lee siempre en UTC),
  las columnas están en minúscula (`instrumentid`, `previousclose`) y cancelar una orden hace un
  `UPDATE` de `status`, la única transición permitida.

**Anomalía en los datos de ejemplo**

- El usuario 1 vendió 30 acciones del instrumento 31 habiendo comprado 20: su posición neta es −10. Se
  respeta el dato histórico: esa posición no se lista, la venta sí cuenta en los pesos y una venta nueva
  sobre ese instrumento se rechaza por acciones insuficientes.

## Estructura

```text
src/
  app.ts            composition root: arma repositorios, services y rutas por constructor
  server.ts         arranque, apagado ordenado y errores no capturados
  config.ts         variables de entorno validadas con zod (única lectura de process.env)
  holdings/         computeHoldings: saldos y posiciones a partir de las órdenes
  orders/           envío y cancelación de órdenes (patrón Strategy para MARKET y LIMIT)
  portfolio/        consulta del portfolio
  instruments/      búsqueda de activos
  shared/           errores, dinero (decimal.js), paginación, middlewares HTTP, OpenAPI
  migrations/       baseline del esquema heredado + idempotency_keys
test/               tests funcionales (Supertest) y smoke de k6
```

## Proceso (Spec Kit)

Cómo se armó el proyecto, con [Spec Kit](https://github.com/github/spec-kit):

1. `specify init --here --force --non-interactive --integration claude` generó los skills y los
   specs de configuración (varios skills, con reglas para el proyecto).
2. Se completó la **constitution** (`.specify/memory/constitution.md`).
3. `/speckit-specify` con el documento del challenge.
4. `/speckit-plan`: el plan técnico.
5. `/speckit-tasks`: la lista de tareas.
6. `/speckit-analyze`: revisión de consistencia entre spec, plan y tareas.
7. `/speckit-implement`: la implementación, tarea por tarea y con los tests escritos primero.
   /speckit-converge
