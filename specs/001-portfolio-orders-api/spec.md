# Feature Specification: Portfolio, búsqueda de activos y envío de órdenes

**Feature Branch**: `001-portfolio-orders-api`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "@fullstack-challenge.md" — API que permite consultar el portfolio de un usuario, buscar activos y enviar órdenes de compra/venta al mercado (MARKET y LIMIT), con las reglas funcionales del documento del challenge.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enviar una orden de compra o venta (Priority: P1)

Un usuario quiere comprar o vender un activo. Indica el activo, si compra o vende, el tipo de orden (MARKET o LIMIT) y la cantidad, ya sea como cantidad exacta de acciones o como monto total en pesos. El sistema registra la orden con el estado que corresponde y, si se ejecuta, la tenencia del usuario se actualiza.

**Why this priority**: es la operación central del producto y la única con riesgo económico (comprar sin fondos, vender sin acciones). Es también la función que el challenge exige cubrir con un test funcional.

**Independent Test**: enviando órdenes para un usuario con saldo y tenencia conocidos y verificando el estado guardado, el precio, la cantidad y el efecto sobre los pesos disponibles y las acciones.

**Acceptance Scenarios**:

1. **Given** un usuario con pesos suficientes, **When** envía una orden MARKET de compra por 10 acciones, **Then** la orden queda `FILLED` al último precio del activo y sus pesos disponibles bajan en 10 × ese precio.
2. **Given** un usuario con pesos suficientes, **When** envía una orden LIMIT de compra por 10 acciones a un precio indicado, **Then** la orden queda `NEW` con ese precio.
3. **Given** un usuario con pesos insuficientes, **When** envía una orden de compra cuyo monto supera lo disponible, **Then** la orden se guarda en estado `REJECTED` y no cambia su saldo ni su tenencia.
4. **Given** un usuario que tiene 5 acciones de un activo, **When** envía una orden de venta por 8 acciones, **Then** la orden se guarda `REJECTED`.
5. **Given** un activo cuyo último precio es 1.000 pesos, **When** el usuario envía una orden MARKET de compra por un monto de 3.500 pesos, **Then** la orden se registra por 3 acciones (sin fracciones).
6. **Given** un monto en pesos menor al precio de una acción, **When** el usuario envía la orden por monto, **Then** el sistema responde que el pedido no se puede procesar porque la cantidad resultante es cero, y la orden no se registra.
7. **Given** una orden LIMIT enviada sin precio, **When** el sistema la recibe, **Then** la rechaza por datos inválidos y no la guarda.

---

### User Story 2 - Consultar el portfolio (Priority: P2)

Un usuario quiere ver cuánto vale su cuenta, cuántos pesos tiene disponibles para operar y qué activos posee, con la cantidad de acciones, el valor de cada posición en pesos y su rendimiento.

**Why this priority**: es la vista principal del usuario y depende de que las órdenes (P1) estén bien registradas.

**Independent Test**: cargando un conjunto conocido de órdenes y precios para un usuario y comparando la respuesta con valores calculados a mano.

**Acceptance Scenarios**:

1. **Given** un usuario con transferencias entrantes, salientes y órdenes ejecutadas, **When** consulta su portfolio, **Then** ve sus pesos disponibles, el valor total de la cuenta (pesos más valor de mercado de sus posiciones) y una posición por cada activo que posee.
2. **Given** una posición en un activo, **When** el usuario consulta su portfolio, **Then** la posición muestra cantidad de acciones, valor de mercado en pesos (cantidad × último precio), rendimiento total en porcentaje contra su costo promedio y retorno diario en porcentaje.
5. **Given** un usuario con una orden LIMIT de compra pendiente por 10 acciones a 100 pesos, **When** consulta su portfolio, **Then** ve 1.000 pesos menos disponibles para operar, informados como reservados, y el mismo valor total de cuenta.
3. **Given** un activo que el usuario compró y vendió por completo, **When** consulta su portfolio, **Then** ese activo no aparece en el listado de posiciones.
4. **Given** un usuario inexistente, **When** se consulta su portfolio, **Then** el sistema responde que el usuario no existe.

---

### User Story 3 - Buscar activos (Priority: P3)

Un usuario quiere encontrar un activo para operarlo escribiendo parte de su ticker o de su nombre.

**Why this priority**: facilita el uso pero no bloquea operar si el usuario ya conoce el activo.

**Independent Test**: buscando textos conocidos contra el catálogo de instrumentos y verificando los resultados devueltos.

**Acceptance Scenarios**:

1. **Given** un activo con ticker "PAMP", **When** el usuario busca "pam", **Then** el activo aparece en los resultados (sin importar mayúsculas o minúsculas).
2. **Given** un activo cuyo nombre contiene "Pampa", **When** el usuario busca "pampa", **Then** el activo aparece en los resultados.
3. **Given** una búsqueda sin coincidencias, **When** el usuario la envía, **Then** recibe un listado vacío.
4. **Given** una búsqueda vacía, **When** el usuario la envía, **Then** el sistema la rechaza como dato inválido.

---

### User Story 4 - Cancelar una orden pendiente (Priority: P3)

Un usuario quiere cancelar una orden LIMIT que todavía no se ejecutó.

**Why this priority**: el challenge define el estado `CANCELLED` y la regla de que solo se cancelan órdenes `NEW`; sin esta acción ese estado no se alcanza nunca.

**Independent Test**: cancelando órdenes en distintos estados y verificando cuáles cambian a `CANCELLED`.

**Acceptance Scenarios**:

1. **Given** una orden en estado `NEW` del usuario, **When** la cancela, **Then** su estado pasa a `CANCELLED`.
2. **Given** una orden en estado `FILLED`, `REJECTED` o `CANCELLED`, **When** el usuario intenta cancelarla, **Then** el sistema lo rechaza y la orden no cambia.
3. **Given** una orden de otro usuario, **When** el usuario intenta cancelarla, **Then** el sistema lo rechaza.

---

### Edge Cases

- Dos órdenes de compra del mismo usuario llegan al mismo tiempo y cada una por separado cabe en el saldo, pero juntas no: como máximo una se ejecuta; la otra queda `REJECTED`. Lo mismo para ventas sobre las mismas acciones.
- Un mismo envío de orden se repite (reintento por corte de red): no debe crear dos órdenes.
- Activo sin precio en el registro de precios: una orden MARKET sobre él no se puede procesar y no se registra; en el portfolio la posición se muestra sin valor de mercado y se indica que falta el precio.
- Cantidad cero, negativa o con decimales: dato inválido, la orden no se guarda.
- Monto en pesos cero o negativo: dato inválido.
- Orden sobre el instrumento de tipo moneda (pesos) con lado BUY o SELL: dato inválido.
- Usuario o activo inexistente al enviar una orden: el sistema responde que no existe y no guarda nada.
- Usuario sin órdenes: el portfolio muestra cero pesos, valor total cero y listado vacío.
- Precio de cierre anterior igual a cero o ausente: el rendimiento diario no se puede calcular y se informa como no disponible en vez de fallar.

## Requirements *(mandatory)*

### Functional Requirements

**Órdenes**

- **FR-001**: El sistema MUST permitir enviar una orden indicando usuario, activo, lado (`BUY` o `SELL`), tipo (`MARKET` o `LIMIT`) y la cantidad, expresada como cantidad exacta de acciones o como monto total en pesos (una de las dos, no ambas).
- **FR-002**: Cuando la cantidad se expresa como monto en pesos, el sistema MUST calcular la cantidad máxima de acciones enteras que ese monto permite al precio de la orden, redondeando hacia abajo.
- **FR-003**: Una orden `MARKET` MUST ejecutarse al último precio de cierre del activo y quedar en estado `FILLED`. No requiere que el usuario envíe precio.
- **FR-004**: Una orden `LIMIT` MUST requerir un precio mayor a cero enviado por el usuario y quedar en estado `NEW`.
- **FR-005**: Antes de aceptar una compra, el sistema MUST verificar que los pesos disponibles del usuario cubran cantidad × precio; si no alcanzan, la orden MUST guardarse en estado `REJECTED`.
- **FR-006**: Antes de aceptar una venta, el sistema MUST verificar que el usuario tenga al menos la cantidad de acciones a vender; si no alcanza, la orden MUST guardarse en estado `REJECTED`.
- **FR-007**: Toda orden válida (incluidas las rechazadas por fondos o acciones insuficientes) MUST quedar registrada con su usuario, activo, lado, tipo, cantidad, precio, estado y fecha y hora.
- **FR-008**: Una orden con datos inválidos (campos faltantes, cantidad no entera o no positiva, LIMIT sin precio, activo o usuario inexistente) MUST rechazarse sin registrarse, indicando qué dato es inválido.
- **FR-009**: El sistema MUST garantizar que órdenes simultáneas del mismo usuario nunca dejen sus pesos disponibles ni sus acciones de un activo en negativo.
- **FR-010**: El envío de una orden MUST requerir un identificador de envío provisto por el cliente (sin él, el envío se rechaza como dato inválido), de modo que repetir el mismo envío devuelva la orden original en lugar de crear otra.
- **FR-011**: El sistema MUST permitir cancelar una orden en estado `NEW` del propio usuario, pasándola a `CANCELLED`. Cancelar una orden en cualquier otro estado MUST rechazarse sin modificarla.
- **FR-012**: Al ejecutarse una orden, la tenencia del usuario (pesos y acciones) MUST reflejarla en la siguiente consulta de portfolio.

**Portfolio**

- **FR-013**: El sistema MUST devolver, para un usuario, sus pesos disponibles para operar, el valor total de la cuenta y el listado de activos que posee. Si hay pesos reservados por órdenes pendientes, la respuesta MUST mostrarlos aparte de los disponibles.
- **FR-014**: Los pesos disponibles MUST calcularse a partir de los movimientos registrados del usuario: transferencias entrantes (`CASH_IN`) suman, transferencias salientes (`CASH_OUT`) restan, compras ejecutadas restan cantidad × precio y ventas ejecutadas suman cantidad × precio. Además, las órdenes de compra en estado `NEW` reservan cantidad × precio límite, que se descuenta de lo disponible mientras la orden siga pendiente.
- **FR-014a**: Las acciones disponibles para vender de un activo MUST ser la cantidad de la posición menos las acciones comprometidas en órdenes de venta `NEW` de ese activo.
- **FR-014b**: Al cancelar una orden `NEW`, su reserva MUST liberarse en la siguiente consulta.
- **FR-015**: La cantidad de acciones de cada posición MUST calcularse con las órdenes `FILLED` de ese activo (compras suman, ventas restan). Solo se listan posiciones con cantidad mayor a cero.
- **FR-016**: El valor de mercado de cada posición MUST ser la cantidad de acciones × último precio de cierre, en pesos.
- **FR-017**: Cada posición MUST incluir su rendimiento total en porcentaje: (último precio − costo promedio de compra) / costo promedio de compra × 100. El costo promedio es el promedio ponderado de las compras ejecutadas; una venta reduce la cantidad sin cambiar el costo promedio de las acciones restantes.
- **FR-017a**: Cada posición MUST incluir también su retorno diario en porcentaje: (último cierre − cierre anterior) / cierre anterior × 100. Si el cierre anterior falta o es cero, se informa como no disponible.
- **FR-018**: El valor total de la cuenta MUST ser los pesos de la cuenta (disponibles más reservados) más la suma del valor de mercado de todas las posiciones. Reservar pesos no cambia el valor total; solo cambia cuánto se puede operar.
- **FR-019**: Todos los importes MUST expresarse en pesos y calcularse sin errores de redondeo por aritmética de punto flotante.

**Búsqueda**

- **FR-020**: El sistema MUST permitir buscar activos por texto, devolviendo los que contengan el texto en su ticker o en su nombre, sin distinguir mayúsculas ni minúsculas.
- **FR-021**: Cada resultado MUST incluir al menos ticker, nombre, tipo y último precio disponible.
- **FR-022**: La búsqueda MUST excluir el instrumento de tipo moneda y devolver una cantidad acotada de resultados por página.

**Documentación**

- **FR-023**: Las suposiciones y decisiones de diseño MUST documentarse junto con la entrega, incluida una colección de ejemplos de invocación de la API.

### Key Entities

- **Usuario**: titular de una cuenta; tiene email y número de cuenta. Sus pesos y posiciones se derivan de sus órdenes.
- **Instrumento (activo)**: algo que se puede operar; tiene ticker, nombre y tipo. Los pesos están modelados como un instrumento de tipo moneda.
- **Orden**: un movimiento del usuario sobre un instrumento; tiene lado (`BUY`, `SELL`, `CASH_IN`, `CASH_OUT`), tipo (`MARKET`, `LIMIT`), cantidad, precio, estado (`NEW`, `FILLED`, `REJECTED`, `CANCELLED`) y fecha y hora. Es la única fuente para calcular saldos y tenencias.
- **Dato de mercado**: precios de un instrumento en un día: máximo, mínimo, apertura, cierre y cierre anterior. El último cierre es el precio vigente.
- **Posición** (derivada, no se guarda): para un usuario y un activo, la cantidad neta de acciones, su valor de mercado y su rendimiento.
- **Portfolio** (derivado, no se guarda): pesos disponibles, valor total y posiciones de un usuario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las órdenes enviadas en los escenarios de aceptación terminan en el estado esperado (`FILLED`, `NEW` o `REJECTED`) con la cantidad y el precio correctos.
- **SC-002**: En ninguna combinación de órdenes simultáneas un usuario termina con pesos disponibles o acciones de un activo por debajo de cero.
- **SC-003**: Repetir el mismo envío de orden cualquier cantidad de veces produce exactamente una orden registrada.
- **SC-004**: Los valores del portfolio (pesos, valor total, cantidad, valor de mercado y rendimiento de cada posición) coinciden al centavo con un cálculo manual sobre los mismos datos.
- **SC-005**: El 95% de las consultas de portfolio y búsquedas responden en menos de 1 segundo con la carga de datos de prueba.
- **SC-006**: Una persona que lee la documentación puede invocar los cuatro casos de uso (enviar, cancelar, portfolio, búsqueda) en menos de 10 minutos usando los ejemplos provistos.

## Assumptions

- **Sin autenticación**: el challenge indica que no hace falta. El usuario se identifica por su id en cada request. Por eso el principio de tokens en cookie de la constitution no aplica a esta feature.
- **Datos existentes**: las tablas `users`, `instruments`, `orders` y `marketdata` ya existen con datos iniciales en `database.sql`. El esquema se toma como punto de partida y no se rediseña; solo se agrega lo necesario para que el mismo envío no cree dos órdenes.
- **Transferencias**: `CASH_IN` y `CASH_OUT` ya existen en los datos, sobre el instrumento de pesos, con la cantidad igual al monto en pesos y precio 1. Se usan para calcular los pesos. Crear transferencias nuevas por la API queda fuera de alcance.
- **Precios**: no todos los instrumentos tienen precio cargado. El registro de precios guarda una fila por día (fecha sin hora), y el último precio es el cierre de la fecha más reciente.
- **Tenencia**: una orden `CANCELLED` o `REJECTED` no afecta ni saldo ni tenencia. Una orden `NEW` solo afecta lo disponible para operar (reserva), no la tenencia.
- **Mercado**: no se simula el mercado. Una orden `LIMIT` queda `NEW` y nada la ejecuta después dentro del alcance de esta feature.
- **Validación de LIMIT**: una orden `LIMIT` de compra se valida contra los pesos disponibles (ya descontadas las reservas) usando el precio límite; una de venta, contra las acciones disponibles (ya descontadas las ventas pendientes). Si no alcanza, se guarda `REJECTED`, igual que una MARKET.
- **Orden por monto**: para MARKET la cantidad se calcula con el último cierre; para LIMIT, con el precio límite enviado.
- **Último precio**: es el `close` del registro de mercado más reciente de cada instrumento.
- **Cancelación**: la cancelación la pide el mismo usuario dueño de la orden.
- **Carga**: no hay requisito de throughput en el challenge; se asume uso de evaluación (decenas de usuarios), sin pruebas de carga obligatorias. El diseño igual debe soportar órdenes concurrentes del mismo usuario sin saldos negativos.
- **Comisiones e impuestos**: no se consideran.
- **Terminología**: una orden `REJECTED` es una orden registrada que el mercado rechazó (faltan pesos o acciones). Un pedido inválido o no procesable (datos mal formados, sin precio, cantidad cero) no genera ninguna orden.
