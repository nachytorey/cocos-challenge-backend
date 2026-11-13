---
name: express-conventions
description: Convenciones de arquitectura Express 5 + TypeScript de este proyecto (estructura por feature, capas controller/service/repository, composition root, validación con zod, OpenAPI, errores). Usar al crear o modificar cualquier ruta, controller, service, repository o schema del backend.
---

# Express conventions

Reglas derivadas de los principios II, III, VI y XIV de la constitution.

## Estructura por feature

```
src/
  app.ts                      # composition root: crea DataSource, repos, services, routers
  server.ts                   # listen, graceful shutdown
  config.ts                   # env validado con zod (única lectura de process.env)
  shared/
    http/validate.ts          # middleware de validación con zod
    http/error-handler.ts     # middleware de errores → Problem Details
    errors.ts                 # clases de errores de dominio
    openapi.ts                # registry de zod-to-openapi
  orders/
    orders.routes.ts          # router + registro OpenAPI de las rutas
    orders.controller.ts      # transporte
    orders.service.ts         # reglas de negocio
    orders.repository.ts      # TypeORM
    orders.schemas.ts         # zod: request y response
    order.entity.ts
    orders.service.spec.ts    # unit
test/
  orders.e2e.spec.ts          # funcional HTTP (Supertest)
```

## Capas

- **Controller**: recibe el input ya validado (`req.validated`), llama al service y mapea el resultado a la respuesta y su status. Sin reglas de negocio ni repositorios.
- **Service**: toda la lógica. No conoce `req`, `res` ni HTTP; lanza errores de dominio (`InsufficientFundsError`).
- **Repository**: único lugar con TypeORM. Recibe el `EntityManager` cuando participa de una transacción.

## Composition root (inyección por constructor)

```ts
// app.ts
const ordersRepository = new OrdersRepository(dataSource);
const ordersService = new OrdersService(dataSource, ordersRepository, marketDataRepository);
app.use('/v1', ordersRouter(new OrdersController(ordersService)));
```

- Todas las dependencias se pasan por constructor y se arman acá. Sin contenedor de DI, sin singletons globales.
- En tests, construir el service con dobles de los repositorios.

## Validación (zod)

```ts
router.post('/orders', validate({ body: CreateOrderBody, headers: IdempotencyHeaders }), controller.create);
```

- Un schema por input (body, query, params, headers). `.strict()` en objetos para rechazar campos desconocidos.
- Ids con `z.coerce.number().int().positive()`; montos como string decimal validado.
- El tipo del controller sale de `z.infer<typeof Schema>`; nunca se tipa a mano.

## OpenAPI

- Registrar cada ruta en el registry de `@asteasolutions/zod-to-openapi` con los mismos schemas de validación: request, todas las respuestas (incluidos errores) y headers.
- Servir el documento en `/docs-json` y Swagger UI en `/docs` (fuera de producción).
- Una ruta sin registrar no se mergea.

## Errores

- Express 5 propaga solo los errores de handlers `async`; no hace falta `try/catch` para reenviarlos.
- Un único middleware de errores al final (`app.use(errorHandler)`) convierte todo a Problem Details (ver skill `error-contract`).

## Middleware global (orden)

`helmet` → `cors` (orígenes de config) → `express.json({ limit })` → `pino-http` (correlation id) → rate limit → rutas → 404 → error handler.

## Reglas

- TypeScript `strict`; prohibido `any` sin comentario que lo justifique.
- Configuración solo desde `config.ts`; actualizar `.env.example` al agregar variables.
- Logging con `pino`, nunca `console`; nunca loguear secretos ni datos personales.
- Sin dependencias circulares entre features (ver skill `code-smells`).
- Versionar la API (`/v1`); un cambio breaking requiere nueva versión.
