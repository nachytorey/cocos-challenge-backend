---
name: testing-conventions
description: Estrategia test-first con Jest y Supertest (unit y funcionales HTTP) para este backend Express + TypeORM. Usar antes de implementar cualquier comportamiento nuevo o al escribir/revisar tests.
---

# Testing (test-first)

Reglas derivadas del principio I de la constitution (NON-NEGOTIABLE).

## Ciclo

1. Escribir el test que expresa el requisito. Debe FALLAR (Red).
2. Implementar lo mínimo para pasarlo (Green).
3. Refactorizar con los tests en verde.

## Qué se testea

- **Unit** (`src/**/*.spec.ts`): lógica de los services con repositorios reemplazados por dobles. Sin base de datos ni HTTP. Cálculos de dinero, reglas de estado, redondeos.
- **Funcional HTTP** (`test/*.e2e.spec.ts`): cada endpoint con Supertest sobre la app real (`createApp()` del composition root), contra una PostgreSQL de test cargada con el esquema y datos conocidos. Cubre camino feliz y errores principales (400, 404, 409, 422).
- **Concurrencia**: si la feature toca estado compartido, lanzar N requests en paralelo (`Promise.all`) sobre el mismo recurso y verificar el invariante.

## Base de test

- Base separada, nunca la de desarrollo; se recrea o se limpia entre tests (ver skill `db-seeding-fixtures`).
- `createApp(config)` recibe la config, así el test arma la app sin levantar el servidor (`request(app)`).

## Reglas

- Un test por comportamiento, con nombre que describe el comportamiento esperado.
- Casos borde explícitos: valores límite, vacíos, precisión decimal, concurrencia si aplica.
- Los tests no dependen del orden de ejecución ni de datos que dejó otro test.
- No mockear lo que se está probando; mockear solo los bordes.
- Antes de dar algo por terminado: lint, type-check, unit y funcionales en verde, con la cobertura mínima.
