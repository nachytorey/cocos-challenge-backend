---
name: auth-cookies
description: Cómo emitir, leer y borrar el token de sesión en cookies HttpOnly, y cómo configurar CORS para el frontend separado. Usar al tocar login, logout, refresh, guards de auth o CORS.
---

# Auth con cookies HttpOnly

Implementa el principio VII de la constitution (NON-NEGOTIABLE).

## Emitir el token (login)

```ts
res.cookie('token', jwt, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict', // ver "Frontend en otro dominio"
  maxAge: Number(process.env.COOKIE_MAX_AGE_MS),
  path: '/',
});
```

- El token NO va en el body de la respuesta, ni en la URL, ni en logs.
- `secure: true` siempre; en desarrollo local usar HTTPS o un flag de entorno documentado, nunca desactivarlo en producción.

## HTTPS/TLS

- Fuera de local, toda la API va por HTTPS; HTTP se redirige o se rechaza (normalmente lo hace el proxy/load balancer; con proxy usar `app.set('trust proxy', 1)` para que `secure` funcione).
- Activar HSTS con `helmet`: `app.use(helmet())` (incluye `Strict-Transport-Security`).
- `SameSite=Strict` es el default; `lax`/`none` solo con justificación escrita en el plan.

## Middleware global de validación de token

Corre en TODOS los requests (registrar en `AppModule.configure` con `consumer.apply(AuthMiddleware).forRoutes('*')`):

1. Lee `req.cookies.token`.
2. Verifica firma, expiración y revocación (lista de revocados / `jti`).
3. Si es válido: adjunta la identidad (`req.user`). Si falta o es inválido: no adjunta nada.
4. El **guard global deny-by-default** (`APP_GUARD`) decide: sin `req.user` y ruta no marcada `@Public()` → `401`.

Así el middleware autentica y el guard autoriza; ninguna ruta nueva queda abierta por olvido.

## Leer el token

- Usar `cookie-parser` y leer desde `req.cookies.token` en el guard (JwtStrategy con extractor de cookie).
- Rechazar con 401 si falta o es inválido. Nunca aceptar el token desde `Authorization` o body salvo que el plan lo justifique.

## Logout

```ts
res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
```

Los atributos deben coincidir con los del `res.cookie`, o el navegador no la borra.

## CORS con frontend separado

```ts
app.enableCors({
  origin: process.env.CORS_ORIGINS.split(','), // nunca '*'
  credentials: true,
});
```

El frontend debe llamar con `credentials: 'include'` (fetch) o `withCredentials: true`.

## Frontend en otro dominio

- Mismo sitio (p. ej. `app.dominio.com` y `api.dominio.com`): `sameSite: 'strict'` funciona; setear `domain` si hace falta compartir.
- Sitios distintos: `strict` bloquea la cookie en requests cross-site. Pasar a `lax` o `none` exige justificación escrita en el plan; `none` además exige `secure: true`.
- En desarrollo local, `localhost:3000` y `localhost:3001` son el mismo sitio, así que `strict` funciona.

## Variables de entorno (agregar a `.env.example`)

`COOKIE_MAX_AGE_MS`, `CORS_ORIGINS`.

## Tests

- e2e: el login responde `Set-Cookie` con `HttpOnly`, `Secure` y `SameSite`; el body NO contiene el token.
- e2e: logout emite una cookie expirada con los mismos atributos.
- e2e: request sin cookie a una ruta protegida devuelve 401.
