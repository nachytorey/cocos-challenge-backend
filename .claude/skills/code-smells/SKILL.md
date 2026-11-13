---
name: code-smells
description: Catálogo de code smells de NestJS/TypeScript con cómo detectarlos, corregirlos y qué regla automática los atrapa (ESLint, ciclos, cobertura). Usar al escribir, revisar o refactorizar código, al configurar lint/CI o antes de dar una tarea por terminada.
---

# Code smells: detectar y corregir

Implementa el principio XV: los smells se atrapan **con herramientas**, no solo con revisión.

## Catálogo

| Smell | Cómo se ve | Corrección | Enforcement |
|---|---|---|---|
| Promesa flotante | Llamada async sin `await` ni manejo | `await`, o `void` con manejo explícito | `@typescript-eslint/no-floating-promises` |
| Catch que traga | `catch {}` o solo un log | Manejar, traducir a error de dominio o relanzar | `no-empty` + revisión |
| `any` / cast forzado | `as any`, `as unknown as X` | Tipar bien o validar con DTO / type guard | `@typescript-eslint/no-explicit-any` |
| Service gigante | Muchas responsabilidades, cientos de líneas | Dividir por responsabilidad | `max-lines`, `max-lines-per-function` |
| Controller con lógica | Reglas de negocio o repositorios en el controller | Mover al service | Revisión + check de imports por capa |
| Dependencia circular | `forwardRef`, módulos que se importan entre sí | Extraer lo compartido a un tercer módulo o usar eventos | `import/no-cycle` o `madge --circular` |
| Función compleja | Muchos `if` anidados, ramas difíciles de testear | Early return, extraer funciones, Strategy/State si varía por tipo | `complexity`, `max-depth` |
| Demasiados parámetros | Más de 4 argumentos, flags booleanos | Objeto de parámetros; dos funciones en vez de un flag | `max-params` |
| Obsesión por primitivos | Dinero como `number`, ids y estados como `string` suelto | Tipo decimal, enums, tipos con marca | Revisión; prohibir `number` en campos de dinero |
| Números/strings mágicos | `if (status === 3)`, `86400000` | Constante con nombre o config | `no-magic-numbers` (warn) |
| N+1 | Query dentro de un loop | Join, `relations`, `IN (...)` | Log de queries en tests; revisión |
| Entidad expuesta | Devolver la entidad de TypeORM por la API | Response DTO | Revisión + Swagger |
| Código muerto | Imports, variables o funciones sin uso; código comentado | Borrar | `no-unused-vars`, `noUnusedLocals` |
| `console.log` | Logs fuera del logger | Usar el logger estructurado | `no-console` |
| Test débil | Sin asserts, mockea lo que prueba, depende del orden | Assert de comportamiento; mockear solo los bordes | `jest/expect-expect`, cobertura de ramas |
| Duplicación | Mismo bloque copiado 3+ veces | Extraer en la tercera repetición (regla de tres) | Revisión (o `jscpd`) |
| Sobreingeniería | Interfaz con una sola implementación, capas vacías | Borrar la abstracción | Ver skill `simplicity-first` |

## Configuración base (aplicar al crear el proyecto)

ESLint (`eslint.config.mjs`, con `typescript-eslint` type-checked):

```js
rules: {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': 'error',
  'no-console': 'error',
  'no-empty': 'error',
  complexity: ['error', 10],
  'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
  'max-params': ['error', 4],
  'max-depth': ['error', 3],
  'import/no-cycle': 'error',
}
```

Jest (`coverageThreshold`): `{ global: { lines: 80, branches: 80 } }` sobre la lógica de negocio.

`tsconfig`: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`.

Los límites son valores por defecto de la constitution; subir uno para una función puntual exige un comentario que lo justifique (`// eslint-disable-next-line <regla> -- motivo`).

## Compuertas en CI

lint → type-check → ciclos → unit con cobertura → e2e. Opcional: diff de OpenAPI contra la rama principal para detectar cambios breaking del contrato.

## Al revisar o refactorizar

1. Correr lint y tests antes de tocar nada.
2. Corregir un smell por vez, con los tests en verde entre cada paso.
3. No mezclar refactor con cambio de comportamiento en el mismo commit.
4. Si aparece un smell que ninguna regla atrapa y se repite, agregar la regla.
