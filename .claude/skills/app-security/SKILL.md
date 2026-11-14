---
name: app-security
description: Seguridad de aplicación en Express (CSRF, hash de contraseñas con argon2, modelo de autorización, límites de body, headers, auditoría de dependencias, datos personales). Usar al implementar login/registro, endpoints que cambian estado, roles y permisos, o al configurar el arranque y el CI.
---

# Application security

Implementa el principio XVI. Complementa `auth-cookies` (token) y `rate-limiting` (abuso).

## CSRF

- Ningún `GET` cambia estado.
- **Condicional: solo si la API autentica con cookies.** CSRF abusa de credenciales que el navegador manda solo; sin cookies ni sesión no hay nada que proteger y el chequeo es código sin requisito (ver `consigna-first`).
- Con cookies, en requests que cambian estado (`POST/PUT/PATCH/DELETE`), verificar que el header `Origin` esté en la lista de orígenes permitidos (`CORS_ORIGINS`); si no, `403`.
- Con `SameSite=Strict` eso alcanza. Si el plan relaja a `Lax` o `None`, agregar además token anti-CSRF (double-submit: cookie no HttpOnly + header `X-CSRF-Token` comparados en un guard).

## Credenciales

- Contraseñas con `argon2id` (librería `argon2`), parámetros por config. Nunca cifrado reversible, nunca en logs ni respuestas.
- Login con respuesta y tiempo indistinguibles para "usuario inexistente" y "contraseña incorrecta" (`401` genérico); verificar siempre contra un hash aunque el usuario no exista.
- Rate limit estricto en login y verificación de códigos (skill `rate-limiting`).
- Tokens de reseteo: aleatorios, de un solo uso, con expiración corta, guardados como hash.

## Autorización

- Un solo modelo declarado en el plan: roles (middleware `requireRole('admin')`) o permisos. No mezclar.
- Mínimo privilegio por defecto: lo no permitido explícitamente está denegado.
- Autorización a nivel de recurso (dueño del dato) antes del handler; un recurso ajeno responde `404` o `403` de forma consistente.
- Nunca confiar en ids, roles o `userId` que vengan del body: la identidad sale de `req.user`.

## Límites y headers

- Tamaño máximo de body (`express.json({ limit: '100kb' })` o el valor que defina el plan); subidas de archivos con límite propio y validación de tipo.
- `helmet()` activo; desactivar `X-Powered-By`.
- HTTPS obligatorio (`403 HTTPS_REQUIRED`) y HSTS: **condicional**, solo si el spec o el plan declaran un requisito de despliegue. Normalmente lo resuelve el proxy o el balanceador, no la app.
- Swagger no expuesto en producción (o protegido).

## Dependencias y secretos

- Lockfile commiteado; instalar con `npm ci`.
- CI falla ante vulnerabilidades altas o críticas (`npm audit --audit-level=high`).
- Secretos solo por variables de entorno; nunca en el repo, en logs ni en mensajes de error.

## Datos personales

- Guardar solo lo que el spec requiere.
- Redactar en logs (ver `observability`); no devolverlos en errores.

## Tests

- e2e (solo con cookies): request que cambia estado con `Origin` no permitido → `403`.
- e2e: login con usuario inexistente y con contraseña incorrecta devuelven la misma respuesta.
- e2e: usuario A no puede leer ni modificar un recurso de usuario B.
- e2e: body mayor al límite → `413`.
- Unit: la contraseña guardada es un hash argon2 y nunca aparece en la respuesta.
