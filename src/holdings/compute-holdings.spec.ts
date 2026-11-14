import { computeHoldings, type HoldingOrder } from './compute-holdings';

const ARS = 66;

function o(partial: Partial<HoldingOrder> & Pick<HoldingOrder, 'side' | 'status'>): HoldingOrder {
  return { instrumentId: 1, size: 1, price: '1', ...partial };
}

// Las 11 órdenes del usuario 1 de database.sql, en orden cronológico.
const user1Orders: HoldingOrder[] = [
  { instrumentId: ARS, size: 1000000, price: '1', side: 'CASH_IN', status: 'FILLED' },
  { instrumentId: 47, size: 50, price: '930', side: 'BUY', status: 'FILLED' },
  { instrumentId: 47, size: 50, price: '920', side: 'BUY', status: 'CANCELLED' },
  { instrumentId: 47, size: 10, price: '940', side: 'SELL', status: 'FILLED' },
  { instrumentId: 45, size: 50, price: '710', side: 'BUY', status: 'NEW' },
  { instrumentId: 47, size: 100, price: '950', side: 'SELL', status: 'REJECTED' },
  { instrumentId: 31, size: 60, price: '1500', side: 'BUY', status: 'NEW' },
  { instrumentId: ARS, size: 100000, price: '1', side: 'CASH_OUT', status: 'FILLED' },
  { instrumentId: 31, size: 20, price: '1540', side: 'BUY', status: 'FILLED' },
  { instrumentId: 54, size: 500, price: '250', side: 'BUY', status: 'FILLED' },
  { instrumentId: 31, size: 30, price: '1530', side: 'SELL', status: 'FILLED' },
];

describe('computeHoldings', () => {
  it('CASH_IN suma y CASH_OUT resta size', () => {
    const h = computeHoldings([
      o({ side: 'CASH_IN', status: 'FILLED', size: 1000 }),
      o({ side: 'CASH_OUT', status: 'FILLED', size: 300 }),
    ]);
    expect(h.cashBalance.toFixed(2)).toBe('700.00');
    expect(h.positions.size).toBe(0);
  });

  it('BUY FILLED resta size × price y SELL FILLED suma size × price', () => {
    const h = computeHoldings([
      o({ side: 'CASH_IN', status: 'FILLED', size: 1000 }),
      o({ side: 'BUY', status: 'FILLED', size: 3, price: '100.50' }),
      o({ side: 'SELL', status: 'FILLED', size: 1, price: '110' }),
    ]);
    expect(h.cashBalance.toFixed(2)).toBe('808.50');
    expect(h.positions.get(1)?.quantity).toBe(2);
  });

  it('recalcula el costo promedio ponderado en cada compra y no lo cambia al vender', () => {
    const h = computeHoldings([
      o({ side: 'BUY', status: 'FILLED', size: 10, price: '100' }),
      o({ side: 'BUY', status: 'FILLED', size: 10, price: '200' }),
      o({ side: 'SELL', status: 'FILLED', size: 5, price: '300' }),
    ]);
    const p = h.positions.get(1);
    expect(p?.quantity).toBe(15);
    expect(p?.averageCost.toFixed(2)).toBe('150.00');
  });

  it('reinicia el costo promedio cuando la cantidad llega a cero', () => {
    const h = computeHoldings([
      o({ side: 'BUY', status: 'FILLED', size: 10, price: '100' }),
      o({ side: 'SELL', status: 'FILLED', size: 10, price: '120' }),
      o({ side: 'BUY', status: 'FILLED', size: 2, price: '300' }),
    ]);
    expect(h.positions.get(1)?.averageCost.toFixed(2)).toBe('300.00');
  });

  it('BUY NEW reserva pesos y SELL NEW reserva acciones', () => {
    const h = computeHoldings([
      o({ side: 'CASH_IN', status: 'FILLED', size: 1000 }),
      o({ side: 'BUY', status: 'FILLED', size: 5, price: '10' }),
      o({ side: 'BUY', status: 'NEW', size: 4, price: '50' }),
      o({ side: 'SELL', status: 'NEW', size: 2, price: '12' }),
    ]);
    expect(h.cashBalance.toFixed(2)).toBe('950.00');
    expect(h.reservedCash.toFixed(2)).toBe('200.00');
    expect(h.availableCash.toFixed(2)).toBe('750.00');
    const p = h.positions.get(1);
    expect(p).toMatchObject({ quantity: 5, reservedQuantity: 2, availableQuantity: 3 });
  });

  it('REJECTED y CANCELLED no afectan nada', () => {
    const h = computeHoldings([
      o({ side: 'BUY', status: 'REJECTED', size: 5, price: '10' }),
      o({ side: 'BUY', status: 'CANCELLED', size: 5, price: '10' }),
      o({ side: 'CASH_IN', status: 'CANCELLED', size: 5 }),
    ]);
    expect(h.cashBalance.toFixed(2)).toBe('0.00');
    expect(h.reservedCash.toFixed(2)).toBe('0.00');
    expect(h.positions.size).toBe(0);
  });

  it('con las 11 órdenes del usuario 1 de database.sql', () => {
    const h = computeHoldings(user1Orders);
    expect(h.cashBalance.toFixed(2)).toBe('753000.00');
    expect(h.reservedCash.toFixed(2)).toBe('125500.00');
    expect(h.availableCash.toFixed(2)).toBe('627500.00');
    expect(h.positions.get(47)).toMatchObject({ quantity: 40 });
    expect(h.positions.get(47)?.averageCost.toFixed(2)).toBe('930.00');
    expect(h.positions.get(54)).toMatchObject({ quantity: 500 });
    expect(h.positions.get(54)?.averageCost.toFixed(2)).toBe('250.00');
    expect(h.positions.get(31)?.quantity).toBe(-10);
    expect(h.positions.has(ARS)).toBe(false);
  });
});
