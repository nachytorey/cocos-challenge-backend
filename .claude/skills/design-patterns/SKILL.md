---
name: design-patterns
description: Catálogo de patrones de diseño aplicados a Express/TypeScript y cómo elegir y justificar uno en cada feature. Usar al planificar (plan.md) o implementar lógica de negocio, integraciones externas, reglas variables o flujos con estados.
---

# Design patterns en Express + TypeScript

Implementa el principio XIII: todo plan toma una **decisión explícita de patrón** por feature.

- Si la feature tiene comportamiento que varía por tipo, una integración externa, transiciones de estado, reglas combinables o comportamiento transversal → usa un patrón nombrado y justificado.
- Si no tiene nada de eso → el plan escribe "no hace falta un patrón adicional" con el motivo. No se agrega un patrón sin problema concreto (principio V).
- Repository, inyección de dependencias y módulos **no cuentan**: ya son obligatorios por el framework y la constitution.

## Cómo elegir

| Problema | Patrón | En este proyecto |
|---|---|---|
| Acceso a datos desacoplado de la lógica | **Repository** | Clase `*Repository` que envuelve TypeORM, pasada por constructor |
| Varias variantes de un algoritmo (comisiones, descuentos, tipos de orden) | **Strategy** | Providers con token común + selector por clave |
| Crear objetos según tipo/contexto | **Factory** | Función o clase `*Factory` armada en el composition root |
| Integrar API/librería externa con interfaz distinta | **Adapter** | Clase que implementa nuestro puerto y envuelve al cliente (acá van retry + breaker) |
| Simplificar un subsistema complejo | **Facade** | Service que orquesta varios providers detrás de un método |
| Añadir comportamiento sin tocar la clase (cache, logs, métricas) | **Decorator** | Middleware de Express o una clase que envuelve otra con la misma interfaz |
| Reaccionar a hechos del dominio | **Observer / Event** | `EventEmitter` de Node (en proceso) o eventos de outbox |
| Comportamiento según estado (orden: pending → paid → shipped) | **State** | Máquina de estados con transiciones válidas explícitas |
| Pasos fijos con detalles variables | **Template Method** | Clase base abstracta con hooks |
| Reglas de negocio combinables | **Specification** | Objetos de regla composables (`and/or/not`) |
| Lecturas y escrituras con necesidades distintas | **CQRS** | Services de comando y de consulta separados, con modelos de lectura propios |
| Flujos distribuidos | **Saga / Outbox** | Ver skill `payments-saga-outbox` |

## Reglas

- El plan nombra el patrón, el problema que resuelve y la alternativa más simple descartada.
- El patrón se reconoce en el código: nombres como `*Strategy`, `*Factory`, `*Adapter`; programar contra interfaces/tokens, no clases concretas.
- Inyección por constructor armada en el composition root; evitar singletons globales.
- Los tests cubren los puntos de extensión (agregar una nueva Strategy, una transición de State, un Adapter con el cliente mockeado).
- No apilar patrones: uno que resuelva bien el problema alcanza.

## Ejemplo mínimo (Strategy)

```ts
export interface FeeStrategy { supports(type: string): boolean; calculate(amount: Decimal): Decimal; }

export class FeeService {
  constructor(private readonly strategies: FeeStrategy[]) {} // se arma en app.ts
  fee(type: string, amount: Decimal) {
    const s = this.strategies.find((x) => x.supports(type));
    if (!s) throw new UnsupportedTypeError(type); // error de dominio
    return s.calculate(amount);
  }
}
```
