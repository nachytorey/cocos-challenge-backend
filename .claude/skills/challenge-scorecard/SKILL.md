---
name: challenge-scorecard
description: Evalúa la API contra la consigna del challenge con una rúbrica fija (cumplimiento 40, tests 15, simplicidad 20, escalabilidad 20, documentación 5), corriendo la evidencia y comparando contra la vuelta anterior. Usar cuando se pida puntuar, auditar o re-evaluar el proyecto contra el enunciado.
---

# Challenge scorecard

La rúbrica completa, con los ítems de cada criterio y las reglas de descuento, vive en
[docs/analisis-consigna.md](../../../docs/analisis-consigna.md), sección *Rúbrica para repetir la evaluación*. **Ese archivo es la referencia: se actualiza, no se reescribe con otra vara.**

## Criterios y pesos (no cambian entre vueltas)

| # | Criterio | Peso |
|---|---|---|
| A | Cumplimiento funcional | 40 |
| B | Tests | 15 |
| C | Simplicidad (sin sobreingeniería) | 20 |
| D | Escalabilidad y optimización | 20 |
| E | Documentación y entregables | 5 |

Prioridad: primero cumplir la consigna con tests (A + B), después no sobrediseñar (C), después escalar (D).

## Procedimiento

1. **Leer** `docs/analisis-consigna.md`: puntaje anterior, commit evaluado y reglas.
2. **Correr la evidencia**, en este orden y sin saltear ninguna:
   `npm run lint && npm run typecheck && npm run check:cycles`, `npm test`, `npm run test:functional`.
   Si falla algo, reportarlo con la salida; B no pasa de 8.
3. **A, cumplimiento.** Releer el enunciado y recalcular a mano el portfolio del usuario 1 con `.challenge/database.sql`; comparar con lo que devuelve la API. Mandar el request mínimo del enunciado a cada endpoint (ver `consigna-first`).
4. **C, simplicidad.** Medir: líneas de producción por área (dominio vs `shared`/infra/arranque) y líneas de proceso (skills, specs, constitution) contra líneas de código. Buscar validaciones duplicadas y mecanismos sin línea del enunciado.
5. **D, escalabilidad.** Correr el `EXPLAIN ANALYZE` con 1M de órdenes de `query-plan-check` sobre las consultas de portfolio y envío de orden. No puntuar de memoria.
6. **Puntuar** con los mismos ítems y reglas de descuento.
7. **Actualizar** `docs/analisis-consigna.md`: nuevo puntaje, commit evaluado, fecha, y una tabla *vuelta anterior → vuelta actual* con el motivo de cada cambio de puntos.

## Reglas para puntuar igual en cada vuelta

- Un hallazgo sin evidencia reproducible (comando, plan de ejecución, línea de código) no descuenta.
- No cambiar pesos ni ítems para "mejorar" el puntaje; si la rúbrica tiene un error, corregirlo en una sección aparte y re-puntuar **las dos vueltas** con la regla nueva.
- Lo que el enunciado marca como opcional o "se puede" no descuenta si falta.
- Una medición que no se pudo correr (p. ej. k6 sin instalar) se reporta como no corrida; no se asume que pasa ni que falla.
- Medir en la base de test, dentro de una transacción con `ROLLBACK`; nunca sobre datos de desarrollo.

## Escala de lectura

| Rango | Significado |
|---|---|
| 90 a 100 | Cumple todo, simple y listo para escalar |
| 80 a 89 | Cumple todo; hay costos claros en simplicidad o en escala |
| 65 a 79 | Cumple lo central con huecos funcionales o tests incompletos |
| Menos de 65 | No cumple alguna parte de la consigna o no tiene el test pedido |

## Salida

Un resumen corto al usuario: puntaje, delta contra la vuelta anterior, los 3 hallazgos que más pesan y qué cambio subiría más el puntaje.
