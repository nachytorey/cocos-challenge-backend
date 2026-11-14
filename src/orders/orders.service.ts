import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { computeHoldings, type Holdings } from '../holdings/compute-holdings';
import type { HoldingsRepository } from '../holdings/holdings.repository';
import { InstrumentType } from '../instruments/instrument.entity';
import type { MarketDataRepository } from '../market-data/market-data.repository';
import {
  IdempotencyKeyReusedError,
  NotFoundError,
  OrderNotCancellableError,
  ValidationFailedError,
  ZeroQuantityError,
} from '../shared/errors';
import { toDecimal, type Decimal } from '../shared/money';
import type { UsersRepository } from '../users/users.repository';
import type { IdempotencyKey } from './idempotency-key.entity';
import type { OrderStatus, OrderType } from './order.entity';
import type { OrderTypeStrategy } from './order-type.strategy';
import type { NewOrder, OrdersRepository } from './orders.repository';
import {
  OrderResponse,
  toOrderResponse,
  type CreateOrderInput,
  type OrderResponseBody,
} from './orders.schemas';

export interface TransactionRunner {
  transaction<T>(run: (manager: EntityManager) => Promise<T>): Promise<T>;
}

export interface OrdersServiceDeps {
  transactions: TransactionRunner;
  users: Pick<UsersRepository, 'lockForUpdate'>;
  orders: Pick<
    OrdersRepository,
    | 'findInstrument'
    | 'insert'
    | 'findIdempotencyKey'
    | 'insertIdempotencyKey'
    | 'findByIdForUser'
    | 'updateStatus'
  >;
  marketData: Pick<MarketDataRepository, 'findLatestByInstrumentIds'>;
  holdings: Pick<HoldingsRepository, 'findHoldingOrders'>;
  strategies: Record<OrderType, OrderTypeStrategy>;
  logger: { info(obj: object, msg?: string): void };
}

export interface CreateOrderResult {
  order: OrderResponseBody;
  replayed: boolean;
}

const CREATED = 201;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

/** SHA-256 del body ya validado, con las claves ordenadas: el orden no cambia el hash (R5). */
export function hashRequest(input: CreateOrderInput): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(input)))
    .digest('hex');
}

function canAfford(input: CreateOrderInput, size: number, price: Decimal, h: Holdings): boolean {
  if (input.side === 'BUY') return price.times(size).lte(h.availableCash);
  return size <= (h.positions.get(input.instrumentId)?.availableQuantity ?? 0);
}

function resolveSize(input: CreateOrderInput, price: Decimal): number {
  const size =
    input.quantity ??
    toDecimal(input.amount ?? 0)
      .dividedToIntegerBy(price)
      .toNumber();
  if (size <= 0) throw new ZeroQuantityError();
  return size;
}

export class OrdersService {
  constructor(private readonly deps: OrdersServiceDeps) {}

  /**
   * Envía una orden. Todo ocurre en una transacción con la fila del usuario bloqueada: las órdenes
   * del mismo usuario se serializan, así el saldo nunca queda negativo (R4) y la clave de
   * idempotencia se consulta y se guarda de forma atómica con la orden (R5).
   */
  async create(input: CreateOrderInput, idempotencyKey: string): Promise<CreateOrderResult> {
    const requestHash = hashRequest(input);
    const result = await this.deps.transactions.transaction(async (manager) => {
      await this.lockUser(manager, input.userId);
      const existing = await this.deps.orders.findIdempotencyKey(
        manager,
        input.userId,
        idempotencyKey,
      );
      if (existing) return this.replay(existing, requestHash);

      const order = await this.deps.orders.insert(manager, await this.buildOrder(manager, input));
      const body = toOrderResponse(order);
      await this.deps.orders.insertIdempotencyKey(manager, {
        userId: input.userId,
        key: idempotencyKey,
        requestHash,
        orderId: order.id,
        responseStatus: CREATED,
        responseBody: body,
      });
      return { order: body, replayed: false };
    });
    this.deps.logger.info(
      { ...pickLogFields(result.order), replayed: result.replayed },
      'order.created',
    );
    return result;
  }

  /**
   * Cancela una orden NEW del usuario (FR-011). Toma el mismo lock que el envío, así una
   * cancelación y una compra simultáneas nunca ven un saldo inconsistente.
   */
  async cancel(orderId: number, userId: number): Promise<OrderResponseBody> {
    const cancelled = await this.deps.transactions.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const order = await this.deps.orders.findByIdForUser(manager, orderId, userId);
      if (!order) throw new NotFoundError(`Order ${orderId} not found`);
      if (order.status !== 'NEW') {
        throw new OrderNotCancellableError(
          `Order ${orderId} is ${order.status}; only NEW orders can be cancelled`,
        );
      }
      await this.deps.orders.updateStatus(manager, orderId, 'CANCELLED');
      return toOrderResponse({ ...order, status: 'CANCELLED' });
    });
    this.deps.logger.info(pickLogFields(cancelled), 'order.cancelled');
    return cancelled;
  }

  private async lockUser(manager: EntityManager, userId: number): Promise<void> {
    if (!(await this.deps.users.lockForUpdate(manager, userId))) {
      throw new NotFoundError(`User ${userId} not found`);
    }
  }

  private replay(existing: IdempotencyKey, requestHash: string): CreateOrderResult {
    if (existing.requestHash !== requestHash) throw new IdempotencyKeyReusedError();
    return { order: OrderResponse.parse(existing.responseBody), replayed: true };
  }

  private async buildOrder(manager: EntityManager, input: CreateOrderInput): Promise<NewOrder> {
    await this.assertTradableInstrument(manager, input.instrumentId);
    const prices = await this.deps.marketData.findLatestByInstrumentIds(
      [input.instrumentId],
      manager,
    );
    const strategy = this.deps.strategies[input.type];
    const price = strategy.resolvePrice(input, prices.get(input.instrumentId)?.close);
    const size = resolveSize(input, price);
    const holdings = computeHoldings(
      await this.deps.holdings.findHoldingOrders(manager, input.userId),
    );
    const status: OrderStatus = canAfford(input, size, price, holdings)
      ? strategy.initialStatus()
      : 'REJECTED';
    return {
      instrumentId: input.instrumentId,
      userId: input.userId,
      size,
      price: price.toFixed(2),
      type: input.type,
      side: input.side,
      status,
      datetime: new Date(),
    };
  }

  private async assertTradableInstrument(manager: EntityManager, instrumentId: number) {
    const instrument = await this.deps.orders.findInstrument(manager, instrumentId);
    if (!instrument) throw new NotFoundError(`Instrument ${instrumentId} not found`);
    if (instrument.type === InstrumentType.CURRENCY) {
      throw new ValidationFailedError('The currency instrument cannot be bought or sold', [
        { field: 'instrumentId', message: 'cannot be the currency instrument' },
      ]);
    }
  }
}

function pickLogFields(order: OrderResponseBody) {
  const { id, userId, instrumentId, side, type, status, quantity } = order;
  return { orderId: id, userId, instrumentId, side, type, status, size: quantity };
}
