---
name: consigna-first
description: Todo lo que la API exige, expone o agrega tiene que apuntar a una línea del enunciado o spec; el contrato nunca es más estricto que lo pedido y, ante dos lecturas, gana la literal. Usar al especificar, planificar o revisar contratos de endpoints, campos y headers obligatorios, o al agregar middlewares e infraestructura.
---

# Consigna first

Implementa el principio XVIII. Nació de una evaluación real: la API cumplía todo, pero perdió puntos por **exigir** más de lo pedido y por agregar piezas que ninguna línea del enunciado usaba.

## Regla 1: cada pieza apunta a una línea del enunciado

Para todo endpoint, campo, header, middleware, tabla o variable de entorno, poder completar:

> "Existe porque el enunciado/spec dice: «…» (línea o FR-xxx)".

Si no hay cita, es una de dos: se saca, o va a *Complexity Tracking* con el requisito de despliegue o de negocio que la exige. "Es buena práctica" no es un requisito.

## Regla 2: el contrato nunca es más estricto que lo pedido

Un cliente que manda **exactamente** lo que describe el enunciado tiene que recibir una respuesta de éxito.

| Exigencia agregada | Qué hacer |
|---|---|
| Header obligatorio que el enunciado no menciona (`Idempotency-Key`) | Opcional: si viene, se aplica la idempotencia; si no, el flujo sigue sin ella |
| Campo obligatorio que el enunciado no menciona (`currency`) | Opcional con valor por defecto (`ARS`); si viene con otro valor, 400 |
| Rechazar campos extra (`.strict()`) | Solo si el enunciado define el contrato cerrado; si no, ignorarlos |
| Paginación obligatoria en un catálogo chico | Parámetros opcionales con default; sin cursor el endpoint responde igual |

Comprobación: armar el request mínimo del enunciado y mandarlo. Si no es 2xx, el contrato es demasiado estricto.

## Regla 3: ante dos lecturas, gana la literal

Si una regla del enunciado admite dos interpretaciones (p. ej. "pesos disponibles" con o sin reservas de órdenes `NEW`):

1. El campo que el enunciado nombra devuelve el valor **literal** (`availableCash` = saldo según las órdenes `FILLED`).
2. La interpretación propia se expone como **campo adicional** con nombre explícito (`reservedCash`, `spendableCash`).
3. La decisión queda escrita en el README, con el número de cada lectura.

Así un corrector con la lectura literal en mente ve su número, y quien quiera la otra lectura la tiene a un campo de distancia.

## Regla 4: una regla vive en un solo lugar

Una validación (p. ej. "LIMIT requiere precio") se escribe en el schema de entrada **o** en el dominio, no en ambos. Si el schema ya la garantiza, la copia del dominio es código muerto que además confunde. Antes de agregar una validación, buscar si ya existe con `grep`.

## Checklist de revisión (un "sí" = corregir o justificar)

1. ¿Hay un header, campo o parámetro obligatorio que el enunciado no menciona?
2. ¿Hay un middleware, endpoint, tabla o variable que no puedo atar a una línea del enunciado?
3. ¿Un campo con nombre del enunciado devuelve un valor distinto del literal?
4. ¿Hay un documento de contrato escrito a mano **y** uno generado del código?
5. ¿La misma regla de validación aparece en dos capas?
6. ¿El request mínimo del enunciado devuelve algo distinto de 2xx?

## Relación con otros skills

- `simplicity-first` decide **cuánto** crecer; este skill decide **qué** se puede exigir y devolver.
- `challenge-scorecard` puntúa el resultado con esta misma vara.
