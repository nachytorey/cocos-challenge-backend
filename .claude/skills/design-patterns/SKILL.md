---
name: design-patterns
description: Catálogo de patrones de diseño aplicados a NestJS/TypeScript y cómo elegir y justificar uno en cada feature. Usar al planificar (plan.md) o implementar lógica de negocio, integraciones externas, reglas variables o flujos con estados.
---

# Design patterns en NestJS

Implementa el principio XIII: todo plan toma una **decisión explícita de patrón** por feature.

- Si la feature tiene comportamiento que varía por tipo, una integración externa, transiciones de estado, reglas combinables o comportamiento transversal → usa un patrón nombrado y justificado.
- Si no tiene nada de eso → el plan escribe "no hace falta un patrón adicional" con el motivo. No se agrega un patrón sin problema concreto (principio V).
- Repository, inyección de dependencias y módulos **no cuentan**: ya son obligatorios por el framework y la constitution.

## Cómo elegir

| Problema | Patrón | En NestJS |
|---|---|---|
| Acceso a datos desacoplado de la lógica | **Repository** | `@InjectRepository` / repositorio propio tras una interfaz |
| Varias variantes de un algoritmo (comisiones, descuentos, tipos de orden) | **Strategy** | Providers con token común + selector por clave |
| Crear objetos según tipo/contexto | **Factory** | Provider factory (`useFactory`) o `XFactory` inyectable |
| Integrar API/librería externa con interfaz distinta | **Adapter** | Clase que implementa nuestro puerto y envuelve al cliente (acá van retry + breaker) |
| Simplificar un subsistema complejo | **Facade** | Service que orquesta varios providers detrás de un método |
| Añadir comportamiento sin tocar la clase (cache, logs, métricas) | **Decorator** | Interceptors, decoradores de método, wrappers de provider |
| Reaccionar a hechos del dominio | **Observer / Event** | `@nestjs/event-emitter` y eventos de outbox |
| Comportamiento según estado (orden: pending → paid → shipped) | **State** | Máquina de estados con transiciones válidas explícitas |
| Pasos fijos con detalles variables | **Template Method** | Clase base abstracta con hooks |
| Reglas de negocio combinables | **Specification** | Objetos de regla composables (`and/or/not`) |
| Lecturas y escrituras con necesidades distintas | **CQRS** | `@nestjs/cqrs` (commands/queries separados) |
| Flujos distribuidos | **Saga / Outbox** | Ver skill `payments-saga-outbox` |

## Reglas

- El plan nombra el patrón, el problema que resuelve y la alternativa más simple descartada.
- El patrón se reconoce en el código: nombres como `*Strategy`, `*Factory`, `*Adapter`; programar contra interfaces/tokens, no clases concretas.
- Inyección de dependencias de Nest como mecanismo base; evitar singletons manuales.
- Los tests cubren los puntos de extensión (agregar una nueva Strategy, una transición de State, un Adapter con el cliente mockeado).
- No apilar patrones: uno que resuelva bien el problema alcanza.

## Ejemplo mínimo (Strategy)

```ts
export interface FeeStrategy { supports(type: string): boolean; calculate(amount: Decimal): Decimal; }

@Injectable()
export class FeeService {
  constructor(@Inject(FEE_STRATEGIES) private readonly strategies: FeeStrategy[]) {}
  fee(type: string, amount: Decimal) {
    const s = this.strategies.find((x) => x.supports(type));
    if (!s) throw new BadRequestException(`Unsupported type ${type}`);
    return s.calculate(amount);
  }
}
```
