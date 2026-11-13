---
name: nestjs-conventions
description: Convenciones de arquitectura NestJS de este proyecto (módulos, controllers, services, DTOs, validación, errores, Swagger). Usar al crear o modificar cualquier módulo, endpoint o DTO del backend.
---

# NestJS conventions

Reglas derivadas de `.specify/memory/constitution.md` (principios II, III, V y VI).

## Estructura por módulo

```
src/<dominio>/
  <dominio>.module.ts
  <dominio>.controller.ts     # solo transporte
  <dominio>.service.ts        # lógica de negocio
  entities/<dominio>.entity.ts
  dto/create-<dominio>.dto.ts
  dto/<dominio>-response.dto.ts
  <dominio>.service.spec.ts   # unit
test/<dominio>.e2e-spec.ts    # e2e
```

## Reglas

- Controller: parsea, valida (vía DTO), llama al service, devuelve un response DTO. Sin lógica de negocio ni repositorios.
- Service: toda la lógica; recibe repositorios por DI (`@InjectRepository`).
- Nunca devolver entidades crudas; mapear a un response DTO.
- `ValidationPipe` global con `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- **Validación en todo endpoint**: body, query y params pasan por DTO; identificadores con `ParseUUIDPipe`/`ParseIntPipe`. Ningún endpoint sin validar.
- **Guard global deny-by-default**: registrar un `AuthGuard` con `APP_GUARD`; las rutas públicas se marcan explícitamente con `@Public()` (leído vía `Reflector`). Un endpoint nuevo nunca queda abierto por olvido.
- **Autorización a nivel de dato**: un guard/policy verifica que el usuario es dueño o tiene acceso al recurso antes de ejecutar el handler (evita IDOR). Validar en un guard no reemplaza validar el DTO: ambos son obligatorios.
- Errores: lanzar excepciones de Nest (`NotFoundException`, `BadRequestException`, etc.); formato de error consistente vía exception filter.
- Documentar cada endpoint con `@ApiTags`, `@ApiOperation`, `@ApiResponse` y `@ApiProperty` en los DTOs.
- Versionar la API (`/v1`); un cambio breaking requiere nueva versión.
- Config solo por `@nestjs/config`; actualizar `.env.example` al agregar variables.
- TypeScript `strict`; prohibido `any` sin comentario que lo justifique.
- Logging estructurado con el logger elegido en el plan (ver skill `observability`), el mismo en todo el código; nunca loguear secretos ni datos personales.
- Sin dependencias circulares entre módulos ni `forwardRef` (ver skill `code-smells`).
