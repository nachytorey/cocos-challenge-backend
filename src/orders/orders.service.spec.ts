import type { EntityManager } from 'typeorm';
import type { HoldingOrder } from '../holdings/compute-holdings';
import {
  IdempotencyKeyReusedError,
  NotFoundError,
  OrderNotCancellableError,
  ValidationFailedError,
  ZeroQuantityError,
} from '../shared/errors';
import type { IdempotencyKey } from './idempotency-key.entity';
import type { Order } from './order.entity';
import { orderTypeStrategies } from './order-type.strategy';
import type { CreateOrderInput } from './orders.schemas';
import { hashRequest, OrdersService, type OrdersServiceDeps } from './orders.service';

const manager = {} as EntityManager;

interface Fixture {
  userExists?: boolean;
  instrument?: { id: number; type: string } | null;
  close?: string;
  holdingOrders?: HoldingOrder[];
  existingKey?: Partial<IdempotencyKey> | null;
  order?: Order | null;
}

function build(f: Fixture = {}) {
  const inserted: Partial<Order>[] = [];
  const keys: Partial<IdempotencyKey>[] = [];
  const deps: OrdersServiceDeps = {
    transactions: { transaction: (fn) => fn(manager) },
    users: { lockForUpdate: jest.fn().mockResolvedValue(f.userExists ?? true) },
    orders: {
      findInstrument: jest
        .fn()
        .mockResolvedValue(
          f.instrument === undefined ? { id: 47, type: 'ACCIONES' } : f.instrument,
        ),
      insert: jest.fn().mockImplementation((_m, order: Partial<Order>) => {
        inserted.push(order);
        return Promise.resolve({ id: 100, ...order });
      }),
      findIdempotencyKey: jest.fn().mockResolvedValue(f.existingKey ?? null),
      insertIdempotencyKey: jest.fn().mockImplementation((_m, row: Partial<IdempotencyKey>) => {
        keys.push(row);
        return Promise.resolve();
      }),
      findByIdForUser: jest.fn().mockResolvedValue(f.order ?? null),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    },
    marketData: {
      findLatestByInstrumentIds: jest
        .fn()
        .mockResolvedValue(
          new Map(f.close ? [[47, { close: f.close, previousClose: f.close }]] : []),
        ),
    },
    holdings: { findHoldingOrders: jest.fn().mockResolvedValue(f.holdingOrders ?? []) },
    strategies: orderTypeStrategies,
    logger: { info: jest.fn() },
  };
  return { service: new OrdersService(deps), deps, inserted, keys };
}

const cash = (amount: number): HoldingOrder => ({
  instrumentId: 66,
  side: 'CASH_IN',
  status: 'FILLED',
  size: amount,
  price: '1',
});

const buy: CreateOrderInput = {
  userId: 1,
  instrumentId: 47,
  side: 'BUY',
  type: 'MARKET',
  currency: 'ARS',
  quantity: 10,
};

describe('OrdersService.create', () => {
  it('MARKET con saldo queda FILLED al último cierre', async () => {
    const { service, inserted } = build({ close: '100.00', holdingOrders: [cash(10000)] });
    const result = await service.create(buy, 'key-00001');
    expect(result.replayed).toBe(false);
    expect(result.order).toMatchObject({
      status: 'FILLED',
      quantity: 10,
      price: { amount: '100.00' },
    });
    expect(inserted[0]).toMatchObject({ size: 10, price: '100.00', status: 'FILLED' });
  });

  it('con amount calcula floor(amount / precio)', async () => {
    const { service } = build({ close: '300.00', holdingOrders: [cash(10000)] });
    const { quantity: _q, ...rest } = buy;
    const result = await service.create({ ...rest, amount: '1000' }, 'key-00002');
    expect(result.order.quantity).toBe(3);
  });

  it('un amount cuya cantidad de acciones no cabe en el INT → ValidationFailedError nombrando amount', async () => {
    // A $0,01 por acción: floor(99.999.999,99 / 0,01) = 9.999.999.999 > 2.147.483.647.
    const { service, inserted } = build({ close: '0.01', holdingOrders: [cash(1)] });
    const { quantity: _q, ...rest } = buy;
    const failure = service.create({ ...rest, amount: '99999999.99' }, 'key-00012');
    await expect(failure).rejects.toThrow(ValidationFailedError);
    await expect(failure).rejects.toMatchObject({
      errors: [expect.objectContaining({ field: 'amount' })],
    });
    expect(inserted).toHaveLength(0);
  });

  it('el mayor amount cuya cantidad sí cabe en el INT se acepta', async () => {
    // A $1 por acción: 2.147.483.647 acciones, justo el máximo.
    const { service } = build({ close: '1.00', holdingOrders: [cash(1)] });
    const { quantity: _q, ...rest } = buy;
    const result = await service.create({ ...rest, amount: '2147483647' }, 'key-00013');
    expect(result.order).toMatchObject({ quantity: 2147483647, status: 'REJECTED' });
  });

  it('si el monto no alcanza para una acción lanza ZeroQuantityError', async () => {
    const { service } = build({ close: '300.00', holdingOrders: [cash(10000)] });
    const { quantity: _q, ...rest } = buy;
    await expect(service.create({ ...rest, amount: '299.99' }, 'key-00003')).rejects.toThrow(
      ZeroQuantityError,
    );
  });

  it('compra por encima de lo disponible → REJECTED', async () => {
    const { service } = build({ close: '100.00', holdingOrders: [cash(999)] });
    expect((await service.create(buy, 'key-00004')).order.status).toBe('REJECTED');
  });

  it('venta por encima de las acciones disponibles → REJECTED', async () => {
    const holdingOrders: HoldingOrder[] = [
      { instrumentId: 47, side: 'BUY', status: 'FILLED', size: 5, price: '10' },
    ];
    const { service } = build({ close: '100.00', holdingOrders });
    const result = await service.create({ ...buy, side: 'SELL', quantity: 6 }, 'key-00005');
    expect(result.order.status).toBe('REJECTED');
  });

  it('instrumento MONEDA → ValidationFailedError', async () => {
    const { service } = build({ instrument: { id: 66, type: 'MONEDA' } });
    await expect(service.create({ ...buy, instrumentId: 66 }, 'key-00006')).rejects.toThrow(
      ValidationFailedError,
    );
  });

  it('usuario inexistente → NotFoundError', async () => {
    const { service } = build({ userExists: false });
    await expect(service.create(buy, 'key-00007')).rejects.toThrow(NotFoundError);
  });

  it('instrumento inexistente → NotFoundError', async () => {
    const { service } = build({ instrument: null });
    await expect(service.create(buy, 'key-00008')).rejects.toThrow(NotFoundError);
  });

  it('clave repetida con el mismo body devuelve la orden guardada sin insertar', async () => {
    const stored = {
      id: 7,
      userId: 1,
      instrumentId: 47,
      side: 'BUY',
      type: 'MARKET',
      status: 'FILLED',
      quantity: 10,
      price: { amount: '100.00', currency: 'ARS' },
      createdAt: '2026-11-13T20:00:00.000Z',
    };
    const { service, deps } = build({
      existingKey: { requestHash: hashRequest(buy), responseBody: stored },
    });
    const result = await service.create(buy, 'key-00009');
    expect(result).toEqual({ order: stored, replayed: true });
    expect(deps.orders.insert).not.toHaveBeenCalled();
  });

  it('clave repetida con otro body → IdempotencyKeyReusedError', async () => {
    const { service } = build({
      existingKey: { requestHash: hashRequest({ ...buy, quantity: 99 }), responseBody: {} },
    });
    await expect(service.create(buy, 'key-00010')).rejects.toThrow(IdempotencyKeyReusedError);
  });

  it('guarda la clave con el hash del body en la misma transacción', async () => {
    const { service, keys } = build({ close: '100.00', holdingOrders: [cash(10000)] });
    await service.create(buy, 'key-00011');
    expect(keys[0]).toMatchObject({
      userId: 1,
      key: 'key-00011',
      requestHash: hashRequest(buy),
      orderId: 100,
      responseStatus: 201,
    });
  });
});

describe('las órdenes NEW reservan y condicionan la validación de las nuevas (FR-014, FR-014a)', () => {
  const pendingBuy = (size: number, price: string): HoldingOrder => ({
    instrumentId: 47,
    side: 'BUY',
    status: 'NEW',
    size,
    price,
  });

  it('una BUY NEW que reserva casi todo el saldo rechaza una compra aunque el saldo total alcance', async () => {
    // Saldo 1000, reservado 900 por la BUY NEW → libres 100. Comprar 2 × 100 = 200 > 100.
    const { service, inserted } = build({
      close: '100.00',
      holdingOrders: [cash(1000), pendingBuy(9, '100')],
    });
    const result = await service.create({ ...buy, quantity: 2 }, 'reserve-key-01');
    expect(result.order.status).toBe('REJECTED');
    expect(inserted[0]).toMatchObject({ status: 'REJECTED', size: 2 });
  });

  it('lo libre justo alcanza: comprar 1 × 100 con 100 libres se ejecuta', async () => {
    const { service } = build({
      close: '100.00',
      holdingOrders: [cash(1000), pendingBuy(9, '100')],
    });
    expect((await service.create({ ...buy, quantity: 1 }, 'reserve-key-02')).order.status).toBe(
      'FILLED',
    );
  });

  it('una SELL NEW reserva acciones: vender más de lo libre se rechaza y lo libre se ejecuta', async () => {
    // Tiene 10, la SELL NEW reserva 8 → libres 2.
    const holdingOrders: HoldingOrder[] = [
      { instrumentId: 47, side: 'BUY', status: 'FILLED', size: 10, price: '10' },
      { instrumentId: 47, side: 'SELL', status: 'NEW', size: 8, price: '12' },
    ];
    const over = build({ close: '100.00', holdingOrders });
    const exact = build({ close: '100.00', holdingOrders });
    const sell = { ...buy, side: 'SELL' as const };
    expect(
      (await over.service.create({ ...sell, quantity: 3 }, 'reserve-key-03')).order.status,
    ).toBe('REJECTED');
    expect(
      (await exact.service.create({ ...sell, quantity: 2 }, 'reserve-key-04')).order.status,
    ).toBe('FILLED');
  });

  it('una orden CANCELLED ya no reserva (el repositorio solo trae FILLED y NEW)', async () => {
    const { service } = build({ close: '100.00', holdingOrders: [cash(1000)] });
    expect((await service.create({ ...buy, quantity: 10 }, 'reserve-key-05')).order.status).toBe(
      'FILLED',
    );
  });
});

describe('OrdersService.cancel', () => {
  const pending = (status: Order['status']): Order => ({
    id: 5,
    userId: 1,
    instrumentId: 45,
    size: 50,
    price: '710.00',
    type: 'LIMIT',
    side: 'BUY',
    status,
    datetime: new Date('2023-07-12T15:14:20Z'),
  });

  it('una orden NEW pasa a CANCELLED', async () => {
    const { service, deps } = build({ order: pending('NEW') });
    const result = await service.cancel(5, 1);
    expect(result).toMatchObject({ id: 5, status: 'CANCELLED', quantity: 50 });
    expect(deps.orders.updateStatus).toHaveBeenCalledWith(manager, 5, 'CANCELLED');
    expect(deps.users.lockForUpdate).toHaveBeenCalledWith(manager, 1);
  });

  it.each(['FILLED', 'REJECTED', 'CANCELLED'] as const)(
    'una orden %s → OrderNotCancellableError sin modificarla',
    async (status) => {
      const { service, deps } = build({ order: pending(status) });
      await expect(service.cancel(5, 1)).rejects.toThrow(OrderNotCancellableError);
      expect(deps.orders.updateStatus).not.toHaveBeenCalled();
    },
  );

  it('orden inexistente o de otro usuario → NotFoundError', async () => {
    const { service, deps } = build({ order: null });
    await expect(service.cancel(5, 2)).rejects.toThrow(NotFoundError);
    expect(deps.orders.findByIdForUser).toHaveBeenCalledWith(manager, 5, 2);
  });

  it('usuario inexistente → NotFoundError', async () => {
    const { service } = build({ userExists: false, order: pending('NEW') });
    await expect(service.cancel(5, 999)).rejects.toThrow(NotFoundError);
  });
});

describe('hashRequest', () => {
  it('el mismo body con las claves en distinto orden produce el mismo hash', () => {
    const reordered: CreateOrderInput = {
      quantity: 10,
      currency: 'ARS',
      type: 'MARKET',
      side: 'BUY',
      instrumentId: 47,
      userId: 1,
    };
    expect(hashRequest(reordered)).toBe(hashRequest(buy));
    expect(hashRequest(buy)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRequest({ ...buy, quantity: 11 })).not.toBe(hashRequest(buy));
  });
});
