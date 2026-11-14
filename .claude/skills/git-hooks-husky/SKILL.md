---
name: git-hooks-husky
description: Git hooks con Husky + lint-staged (pre-commit con eslint/prettier/typecheck, pre-push con ciclos y tests unitarios) y cómo se relacionan con el CI. Usar al tocar .husky, lint-staged, scripts de calidad o al configurar el CI.
---

# Git hooks con Husky

Los hooks dan feedback rápido en local; **el CI sigue siendo la fuente de verdad** (los hooks se pueden saltear con `--no-verify`).

## Qué corre y cuándo

| Hook         | Qué hace                                                        | Por qué                                |
| ------------ | --------------------------------------------------------------- | -------------------------------------- |
| `pre-commit` | `lint-staged` (eslint --fix + prettier --write) y `typecheck`   | Solo archivos staged: rápido           |
| `pre-push`   | `check:cycles` y `npm test` (unit con umbral de cobertura)      | Más lento, se paga una vez por push    |

Los tests funcionales (necesitan PostgreSQL) y el smoke k6 **no** van en hooks: corren en el CI.

## Reglas

1. Los hooks viven en `.husky/` y se instalan solos con `npm install` (script `prepare`).
2. La configuración de `lint-staged` está en `package.json`. Los comandos de los hooks usan los mismos scripts que el CI (`npm run lint`, `typecheck`, `test`): no duplicar lógica.
3. Prohibido `--no-verify` como hábito. Si un hook falla, se arregla la causa.
4. Un hook nuevo debe tardar poco. Si supera ~30 s en pre-commit, moverlo a pre-push o al CI.
5. En el CI hay que usar `npm ci` (ejecuta `prepare`; si molesta, `HUSKY=0`).

## Disparadores para crecer

- Se exigen mensajes de commit convencionales → agregar `commitlint` con hook `commit-msg`.
- El pre-push tarda demasiado → correr solo tests relacionados (`jest --onlyChanged`).
