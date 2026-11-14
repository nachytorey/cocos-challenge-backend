import { toDecimal, type Decimal } from '../shared/money';

export type OrderSide = 'BUY' | 'SELL' | 'CASH_IN' | 'CASH_OUT';
export type OrderStatus = 'NEW' | 'FILLED' | 'REJECTED' | 'CANCELLED';

/** Lo mínimo de una orden que hace falta para calcular saldos y posiciones. */
export interface HoldingOrder {
  instrumentId: number;
  side: OrderSide;
  status: OrderStatus;
  size: number;
  price: string;
}

export interface PositionHolding {
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  averageCost: Decimal;
}

export interface Holdings {
  cashBalance: Decimal;
  reservedCash: Decimal;
  availableCash: Decimal;
  positions: Map<number, PositionHolding>;
}

interface Accumulator {
  cash: Decimal;
  reservedCash: Decimal;
  positions: Map<number, { quantity: number; reservedQuantity: number; averageCost: Decimal }>;
}

type Apply = (acc: Accumulator, order: HoldingOrder) => void;

function position(acc: Accumulator, instrumentId: number) {
  let p = acc.positions.get(instrumentId);
  if (!p) {
    p = { quantity: 0, reservedQuantity: 0, averageCost: toDecimal(0) };
    acc.positions.set(instrumentId, p);
  }
  return p;
}

const cost = (o: HoldingOrder) => toDecimal(o.price).times(o.size);

const applyBuy: Apply = (acc, o) => {
  acc.cash = acc.cash.minus(cost(o));
  const p = position(acc, o.instrumentId);
  const base = Math.max(p.quantity, 0);
  const newQuantity = p.quantity + o.size;
  // Promedio ponderado; si no había tenencia positiva, el costo arranca de cero.
  p.averageCost =
    base === 0
      ? toDecimal(o.price)
      : p.averageCost
          .times(base)
          .plus(cost(o))
          .dividedBy(base + o.size);
  p.quantity = newQuantity;
};

const applySell: Apply = (acc, o) => {
  acc.cash = acc.cash.plus(cost(o));
  const p = position(acc, o.instrumentId);
  p.quantity -= o.size;
  if (p.quantity <= 0) p.averageCost = toDecimal(0);
};

const onFilled: Record<OrderSide, Apply> = {
  CASH_IN: (acc, o) => {
    acc.cash = acc.cash.plus(o.size);
  },
  CASH_OUT: (acc, o) => {
    acc.cash = acc.cash.minus(o.size);
  },
  BUY: applyBuy,
  SELL: applySell,
};

const onNew: Partial<Record<OrderSide, Apply>> = {
  BUY: (acc, o) => {
    acc.reservedCash = acc.reservedCash.plus(cost(o));
  },
  SELL: (acc, o) => {
    position(acc, o.instrumentId).reservedQuantity += o.size;
  },
};

/**
 * Deriva pesos y posiciones de las órdenes del usuario (única fuente de verdad, research R3).
 * Las órdenes deben venir en orden cronológico; REJECTED y CANCELLED no afectan.
 */
export function computeHoldings(orders: HoldingOrder[]): Holdings {
  const acc: Accumulator = { cash: toDecimal(0), reservedCash: toDecimal(0), positions: new Map() };
  for (const order of orders) {
    if (order.status === 'FILLED') onFilled[order.side](acc, order);
    else if (order.status === 'NEW') onNew[order.side]?.(acc, order);
  }
  const positions = new Map<number, PositionHolding>();
  for (const [id, p] of acc.positions) {
    positions.set(id, { ...p, availableQuantity: p.quantity - p.reservedQuantity });
  }
  return {
    cashBalance: acc.cash,
    reservedCash: acc.reservedCash,
    availableCash: acc.cash.minus(acc.reservedCash),
    positions,
  };
}
