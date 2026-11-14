# Análisis de la API contra la consigna

- **Consigna:** [.challenge/fullstack-challenge.md](../.challenge/fullstack-challenge.md)
- **Commit evaluado:** `b5ae8b5` (rama `001-portfolio-orders-api`)
- **Fecha:** 2026-11-14

## Puntaje final: 82 / 100

La API cumple la consigna completa y los tests lo demuestran. Pierde puntos en dos lugares: tiene
bastante más infraestructura de la que el problema pide, y le faltan dos índices que son la mejora
de escala más barata que existe.

| #   | Criterio                          | Peso    | Puntaje | Resumen                                                                    |
| --- | --------------------------------- | ------- | ------- | -------------------------------------------------------------------------- |
| A   | Cumplimiento funcional            | 40      | **38**  | Los tres endpoints y todas las reglas; contrato más exigente que el pedido |
| B   | Tests                             | 15      | **14**  | 271 tests en verde; falta probar con volumen                               |
| C   | Simplicidad (sin sobreingeniería) | 20      | **11**  | Dominio simple; periferia HTTP y de proceso sobredimensionada              |
| D   | Escalabilidad y optimización      | 20      | **14**  | Concurrencia correcta; sin índices y cálculo sobre todo el historial       |
| E   | Documentación y entregables       | 5       | **5**   | README con decisiones, colección REST Client, Swagger                      |
|     | **Total**                         | **100** | **82**  |                                                                            |

Los pesos siguen la prioridad pedida: primero cumplir la consigna con tests (A + B = 55), después no
sobrediseñar (C = 20) y después escalar bien (D = 20).

## Evidencia: qué se corrió

| Comprobación                            | Resultado                                              |
| --------------------------------------- | ------------------------------------------------------ |
| `npm run lint`                          | Sin errores                                            |
| `npm run typecheck`                     | Sin errores                                            |
| `npm run check:cycles`                  | Sin ciclos (63 archivos)                               |
| `npm test` (unit)                       | 146 de 146, cobertura 100% líneas y 94,76% ramas       |
| `npm run test:functional`               | 125 de 125 (14 suites, contra `cocos_test`)            |
| Portfolio del usuario 1, cálculo a mano | Coincide al centavo (ver A)                            |
| Consulta de holdings con 1M de órdenes  | 53,3 ms sin índice, 0,18 ms con índice (ver D)         |
| `npm run test:load` (k6)                | **No se corrió**: k6 no está instalado en esta máquina |

## A. Cumplimiento funcional: 38 / 40

| Ítem                                                                | Máx | Puntaje |
| ------------------------------------------------------------------- | --- | ------- |
| Portfolio (valor total, pesos disponibles, posiciones)              | 10  | 10      |
| Búsqueda por ticker y/o nombre                                      | 6   | 6       |
| Órdenes (MARKET/LIMIT, BUY/SELL, cantidad o monto, estados)         | 16  | 15      |
| Reglas de cálculo (`size`, solo `FILLED`, `close`, ARS como MONEDA) | 5   | 4       |
| Stack pedido (Node, Express, TypeORM)                               | 3   | 3       |

**Lo que cumple**

- **Portfolio.** Verificado a mano con los datos de `database.sql` para el usuario 1: pesos
  1.000.000 − 46.500 + 9.400 − 100.000 − 30.800 − 125.000 + 45.900 = 753.000; reservado por las dos
  LIMIT en `NEW` = 125.500; disponible 627.500; valor total 753.000 + 37.034 + 114.750 = 904.784. Es
  lo que devuelve la API. Cada posición trae cantidad, valor de mercado y rendimiento total, y
  además el retorno diario con `close` y `previousClose`.
- **Búsqueda.** `ILIKE` sobre ticker o nombre, sin distinguir mayúsculas, con los comodines del
  usuario escapados.
- **Órdenes.** MARKET queda `FILLED` al último `close`; LIMIT queda `NEW` con el precio enviado; por
  monto calcula `floor(monto / precio)` sin fracciones; sin pesos o sin acciones la orden se guarda
  `REJECTED`; solo se cancelan las `NEW`.
- **Cálculo.** Todo sale de la tabla `orders` usando `size`, con una sola función pura
  ([compute-holdings.ts](../src/holdings/compute-holdings.ts)). `CASH_IN` y `CASH_OUT` cuentan.

**Dónde pierde puntos**

- **−1, contrato más exigente que la consigna.** `POST /v1/orders` rechaza con 400 si falta el header
  `Idempotency-Key` o el campo `currency`. La consigna no pide ninguno de los dos. Quien pruebe la
  API con el body mínimo que describe el enunciado recibe un error.
- **−1, interpretación de "pesos disponibles".** La API descuenta lo reservado por órdenes `NEW`
  (627.500). La lectura literal de la consigna ("usar las órdenes `FILLED`") da 753.000. La decisión
  es razonable, está documentada y `reservedCash` permite reconstruir el otro número, pero un
  corrector con el valor literal en mente va a ver una diferencia.

**No descuenta:** no se pueden crear `CASH_IN` ni `CASH_OUT` por API. La consigna dice que "se pueden
modelar como órdenes", no pide un endpoint, y el README lo declara fuera de alcance.

## B. Tests: 14 / 15

| Ítem                                            | Máx | Puntaje |
| ----------------------------------------------- | --- | ------- |
| Test funcional del envío de órdenes (lo pedido) | 6   | 6       |
| Todo pasa y se puede reproducir                 | 4   | 4       |
| Reglas de negocio y casos borde                 | 3   | 3       |
| Concurrencia y volumen                          | 2   | 1       |

- La consigna pide **un** test funcional sobre el envío de órdenes. Está en
  [test/orders.functional.spec.ts](../test/orders.functional.spec.ts): app real, HTTP con Supertest,
  base PostgreSQL real con los datos del challenge.
- Hay tests de concurrencia reales: 20 compras simultáneas con saldo para 10 dan exactamente 10
  `FILLED`.
- **−1:** ningún test corre con volumen. El smoke de carga solo hace `GET`, sobre una base con 11
  órdenes, así que no puede detectar el problema del punto D.

## C. Simplicidad: 11 / 20

| Ítem                                         | Máx | Puntaje |
| -------------------------------------------- | --- | ------- |
| Núcleo de dominio simple                     | 8   | 7       |
| Infraestructura proporcional al problema     | 8   | 3       |
| Peso del proceso y los artefactos en el repo | 4   | 1       |

**Lo que está bien.** El dominio es chico y directo: sin contenedor de DI, sin colas, sin cache, sin
CQRS, sin tablas de saldo. Archivos de menos de 210 líneas. `computeHoldings` es una función pura de
111 líneas.

**Dónde hay sobreingeniería**

- **Infraestructura (3 de 8).** De 2.320 líneas de código de producción, unas 1.020 (44%) son
  `shared/`, config, health y arranque. Para tres endpoints sin autenticación hay:
  - `requireHttps` y HSTS, sin que la consigna hable de despliegue.
  - `originCheck` (defensa CSRF) en una API que no tiene cookies ni sesión: no hay nada que proteger.
  - Dos rate limiters (global y de órdenes).
  - Timeout de request, apagado ordenado, readiness, manejo de `lock_timeout`.
  - Paginación por cursor para un catálogo de 66 instrumentos.
  - Un OpenAPI generado desde zod **y** un `openapi.yaml` escrito a mano, con un test que los compara.
  - 17 variables de entorno.
- **Dominio (7 de 8).** El patrón Strategy para dos tipos de orden repite la validación que ya hace el
  schema: "LIMIT necesita precio" y "MARKET no lleva precio" están en
  [orders.schemas.ts:60-65](../src/orders/orders.schemas.ts#L60-L65) y otra vez en
  [order-type.strategy.ts:22-26](../src/orders/order-type.strategy.ts#L22-L26) y
  [42-46](../src/orders/order-type.strategy.ts#L42-L46). La segunda copia nunca se ejecuta por HTTP.
- **Repositorio (1 de 4).** Hay 22.808 líneas de skills, constitution y specs contra 2.320 de código.
  Un corrector que abre el repo ve diez veces más proceso que producto.

**La inconsistencia de fondo.** El plan rechaza agregar dos índices "porque no hay medición que lo
justifique" (principio de simplicidad), pero acepta HTTPS obligatorio, chequeo de Origin y dos rate
limiters, que tampoco tienen un requisito ni una medición. El criterio de simplicidad se aplicó
donde menos convenía.

## D. Escalabilidad y optimización: 14 / 20

| Ítem                                                | Máx | Puntaje |
| --------------------------------------------------- | --- | ------- |
| Corrección bajo concurrencia                        | 6   | 6       |
| Acceso a datos (índices y planes de consulta)       | 6   | 2       |
| Costo de cálculo por request                        | 4   | 3       |
| Escala horizontal (estado, límites, pool, timeouts) | 4   | 3       |

**Lo que está bien**

- **Concurrencia (6 de 6).** Cada envío o cancelación bloquea la fila del usuario
  (`SELECT ... FOR UPDATE`) dentro de una transacción. Las órdenes de un usuario se serializan y
  usuarios distintos no se frenan entre sí. La clave de idempotencia se guarda en la misma
  transacción. Es la solución correcta y la más simple para este problema.
- La app no guarda estado en memoria (salvo el rate limit), usa `decimal.js` para la plata, tiene
  timeouts de query y de lock, y pagina por keyset.

**Dónde pierde puntos**

- **Sin índices (2 de 6).** Las únicas claves indexadas son las primarias. La consulta que alimenta
  el portfolio y **cada** envío de orden filtra `orders` por `userid` y recorre la tabla entera.
  Medido en `cocos_test` con 1.000.000 de órdenes y 10.000 usuarios (dentro de una transacción con
  `ROLLBACK`):

  | Escenario                           | Plan              | Tiempo  |
  | ----------------------------------- | ----------------- | ------- |
  | Como está hoy                       | Parallel Seq Scan | 53,3 ms |
  | Con índice `(userid, datetime, id)` | Bitmap Index Scan | 0,18 ms |

  Es casi 300 veces más lento, y en el envío de órdenes ese scan corre **con el usuario bloqueado**.
  Lo mismo pasa con `marketdata`: `DISTINCT ON (instrumentid)` sin índice en `(instrumentid, date)`.
  La decisión está documentada (research R10) con sus disparadores, por eso no es un cero, pero el
  arreglo es una migración de dos líneas.

- **Cálculo sobre todo el historial (3 de 4).** Cada request trae todas las órdenes `FILLED` y `NEW`
  del usuario a memoria y las recorre. La consigna pide derivar los saldos de `orders`, así que el
  enfoque es el correcto para el challenge; el costo crece con la antigüedad de la cuenta y no hay un
  corte (snapshot) previsto en código.
- **Escala horizontal (3 de 4).** El rate limit vive en la memoria de cada proceso: con dos instancias
  el límite real se duplica. La tabla `idempotency_keys` crece sin vencimiento. La búsqueda
  `ILIKE '%q%'` no puede usar un índice común (alcanza para 66 instrumentos).

## E. Documentación y entregables: 5 / 5

- El README explica cómo levantarlo, las suposiciones y las decisiones de diseño, incluida la anomalía
  de los datos (posición −10 en el instrumento 31).
- El opcional está cubierto: [requests.http](../requests.http) con ejemplos de cada caso, más Swagger
  UI en `/docs`.

## Qué subiría el puntaje

| Cambio                                                                                                     | Criterio | Puntos |
| ---------------------------------------------------------------------------------------------------------- | -------- | ------ |
| Migración con índices en `orders (userid, datetime, id)` y `marketdata (instrumentid, date DESC, id DESC)` | D        | +4     |
| Quitar `requireHttps`, `originCheck` y el `openapi.yaml` duplicado; dejar un solo rate limiter             | C        | +4     |
| `Idempotency-Key` opcional y `currency` con `ARS` por defecto                                              | A        | +1     |
| Sacar la validación de precio repetida en las estrategias                                                  | C        | +1     |
| Un test funcional con volumen (por ejemplo 100.000 órdenes de un usuario)                                  | B        | +1     |
| Mover skills, constitution y specs fuera de la entrega, o resumirlos                                       | C        | +2     |

Con esos cambios el puntaje queda cerca de 95.

## Rúbrica para repetir la evaluación

Usar los mismos criterios, pesos e ítems de las tablas de arriba. Reglas para puntuar igual en otra
vuelta:

1. **Correr primero la evidencia**, en este orden: `npm run lint && npm run typecheck && npm run
check:cycles`, `npm test`, `npm run test:functional`. Si algún test falla, B no puede pasar de 8 y
   el ítem de A que cubre ese test pierde la mitad de sus puntos.
2. **A, cumplimiento.** Cada regla de la consigna que falta o da un resultado distinto resta 2. Cada
   exigencia que la API agrega y la consigna no pide (un campo o header obligatorio) resta 1. Una
   interpretación documentada que cambia un número visible resta 1. Lo que la consigna marca como
   opcional o "se puede" no resta.
3. **B, tests.** El test funcional del envío de órdenes vale 6 por sí solo: tiene que pasar por HTTP
   y por la base real. Volumen y concurrencia valen 1 cada uno.
4. **C, simplicidad.** Por cada mecanismo sin un requisito de la consigna que lo use, restar 1 en
   "infraestructura" (mínimo 0). Duplicación de reglas en el dominio resta 1. En "repositorio", 4 si
   el material de proceso es menor al código, 2 si es hasta cinco veces mayor, 1 si es más.
5. **D, escalabilidad.** "Acceso a datos" se mide con `EXPLAIN ANALYZE` sobre 1M de órdenes: 6 si las
   consultas calientes usan índice, 2 si hacen scan completo pero está documentado, 0 si no está
   documentado. Concurrencia vale 6 solo si hay un test que la demuestre.
6. **E.** 3 por las decisiones en el README, 2 por la colección de requests.

**Escala de lectura del total**

| Rango       | Significado                                                     |
| ----------- | --------------------------------------------------------------- |
| 90 a 100    | Cumple todo, simple y listo para escalar                        |
| 80 a 89     | Cumple todo; hay costos claros en simplicidad o en escala       |
| 65 a 79     | Cumple lo central con huecos funcionales o tests incompletos    |
| Menos de 65 | No cumple alguna parte de la consigna o no tiene el test pedido |
