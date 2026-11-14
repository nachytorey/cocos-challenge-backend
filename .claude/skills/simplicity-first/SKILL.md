---
name: simplicity-first
description: Reglas para detectar sobreingeniería y mantener el diseño simple, con disparadores explícitos para crecer. Usar al planificar, diseñar, revisar un plan, agregar abstracciones, dependencias o mecanismos de escala (cache, colas, outbox, saga, CQRS).
---

# Simplicity first, then grow

Implementa el principio V. **Empezar siempre por lo más simple que cumple el spec; crecer solo con un motivo medible o escrito.**

## Checklist de detección (un "sí" = violación)

1. ¿Hay una interfaz, clase base, factory o genérico con **una sola** implementación y sin segundo uso real? (Regla de tres: abstraer en la tercera repetición.)
2. ¿Hay una librería, capa, servicio, tabla o endpoint que **ningún requisito actual** usa?
3. ¿Un request atraviesa **más de 3 capas** de código propio entre el controller y la base de datos (controller → service → repository)?
4. ¿Se puede cumplir el requisito **borrando código** o usando algo ya incluido en Express, TypeORM o PostgreSQL?
5. ¿Hay cache, cola, outbox, saga, CQRS, réplica o servicio extra **sin una carga o consistencia declarada** que lo exija?
6. ¿Hay un patrón de diseño aplicado sin un problema concreto que resuelva?
7. ¿Hay configuración, flags u opciones que nadie usa "por si acaso"?
8. ¿Hay un middleware o mecanismo de borde (HTTPS obligatorio, chequeo de `Origin`, un segundo rate limiter, paginación en un catálogo chico) que **ninguna línea del enunciado ni requisito de despliegue** usa? Si no hay cookies ni sesión, el chequeo de `Origin` no protege nada.
9. ¿Una misma regla de validación está escrita en dos capas (schema y dominio)? Una sola.
10. ¿Hay un documento de contrato escrito a mano **y** uno generado del código?

## Disparadores para crecer (registrar en el plan)

| Mecanismo | Se introduce cuando... |
|---|---|
| Índice | **Excepción: no espera medición.** Una consulta caliente que filtra por una FK lleva su índice desde el día uno (ver `query-plan-check`); el `EXPLAIN` con volumen sirve para elegir su forma, no para decidir si existe |
| Cache | Medición muestra lectura caliente que no cumple el p95 objetivo |
| Cola / worker | Trabajo lento que no puede ir en el request, o requisito explícito de asincronía |
| Outbox / Saga | El spec exige consistencia entre varios servicios o sistemas externos |
| Lock pesimista | Se observa o se prueba una race con conflictos frecuentes (empezar con UPDATE atómico o versión) |
| CQRS / réplicas | Lecturas y escrituras tienen perfiles que no se pueden servir con el mismo modelo |
| Nueva abstracción | Existen 3 usos concretos que la justifican |
| Microservicio | Equipo o escala independiente demostrada; el default es un monolito modular |

## Qué NO es "complejidad opcional"

Validación en el borde, rate limit global, `helmet`, límite de body, timeouts, test-first y Swagger son la base mínima: no se recortan por simplicidad.

Son **condicionales** (solo con su disparador en el spec, ver `consigna-first`): cookie HttpOnly y guard (si hay sesión), chequeo de `Origin` (si hay cookies), HTTPS obligatorio y HSTS (si el spec habla de despliegue), rate limit estricto por ruta (si el spec declara abuso o una operación sensible) e idempotencia obligatoria (si el spec la exige; si no, opcional).

## Al revisar un plan

- Si dos diseños cumplen el spec, elegir el de **menos piezas móviles**.
- Todo lo que viole el checklist va a *Complexity Tracking* con: qué es, por qué hace falta ahora y qué alternativa más simple se descartó y por qué.
- Preguntar siempre: "¿qué requisito del spec rompe si saco esto?". Si ninguno, se saca.
