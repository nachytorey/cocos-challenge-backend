import type { EntityManager } from 'typeorm';
import type { HoldingOrder } from '../holdings/compute-holdings';
import {
  IdempotencyKeyReusedError,
  NotFoundError,
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
