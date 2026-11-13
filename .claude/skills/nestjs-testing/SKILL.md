---
name: nestjs-testing
description: Estrategia de testing test-first con Jest y Supertest (unit y e2e) para este backend NestJS. Usar antes de implementar cualquier comportamiento nuevo o al escribir/revisar tests.
---

# Testing (test-first)

Reglas derivadas del principio I de la constitution (NON-NEGOTIABLE).

## Ciclo

1. Escribir el test que expresa el requisito. Debe FALLAR (Red).
2. Implementar lo mínimo para pasarlo (Green).
3. Refactorizar con los tests en verde.

## Qué se testea

- **Unit** (`*.service.spec.ts`): lógica de negocio de los services con repositorios mockeados. Sin base de datos ni HTTP.
- **e2e** (`test/*.e2e-spec.ts`): cada endpoint con Supertest, cubriendo camino feliz y errores principales (400 validación, 404, conflictos). Usar una base de datos de test aislada, nunca la de desarrollo.

## Reglas

- Un test por comportamiento, con nombre que describe el comportamiento esperado.
- Casos borde explícitos: valores límite, vacíos, precisión decimal, concurrencia si aplica.
- Los tests no dependen del orden de ejecución ni de datos que dejó otro test.
- No mockear lo que se está probando; mockear solo los bordes (repositorios, clientes externos).
- Antes de dar algo por terminado: lint, type-check, unit y e2e en verde.
