import type { DataSource } from 'typeorm';

let sequence = 0;
const next = () => ++sequence;

export async function createUser(ds: DataSource): Promise<number> {
  const n = next();
  const rows: { id: number }[] = await ds.query(
    `INSERT INTO users (email, accountnumber) VALUES ($1, $2) RETURNING id`,
    [`user${n}@test.com`, `9${String(n).padStart(4, '0')}`],
  );
  return rows[0].id;
}

export async function createInstrument(
  ds: DataSource,
  { ticker, name, type = 'ACCIONES' }: { ticker?: string; name?: string; type?: string } = {},
): Promise<number> {
  const n = next();
  const rows: { id: number }[] = await ds.query(
    `INSERT INTO instruments (ticker, name, type) VALUES ($1, $2, $3) RETURNING id`,
    [ticker ?? `T${n}`, name ?? `Test Instrument ${n}`, type],
  );
  return rows[0].id;
}

export async function cashInstrumentId(ds: DataSource): Promise<number> {
  const rows: { id: number }[] = await ds.query(
    `SELECT id FROM instruments WHERE type = 'MONEDA' ORDER BY id LIMIT 1`,
  );
  if (rows[0]) return rows[0].id;
  return createInstrument(ds, { ticker: 'ARS', name: 'PESOS', type: 'MONEDA' });
}

export async function createMarketData(
  ds: DataSource,
  m: { instrumentId: number; close: string; previousClose: string; date?: string },
): Promise<void> {
  await ds.query(
    `INSERT INTO marketdata (instrumentid, high, low, open, close, previousclose, date)
     VALUES ($1, $2, $2, $2, $2, $3, $4)`,
    [m.instrumentId, m.close, m.previousClose, m.date ?? '2023-07-14'],
  );
}

export async function createOrder(
  ds: DataSource,
  o: {
    userId: number;
    instrumentId: number;
    side: string;
    status: string;
    size: number;
    price: string;
    type?: string;
  },
): Promise<number> {
  const rows: { id: number }[] = await ds.query(
    `INSERT INTO orders (instrumentid, userid, size, price, type, side, status, datetime)
     VALUES ($1, $2, $3, $4, $5, $6, $7, (now() AT TIME ZONE 'UTC')) RETURNING id`,
    [o.instrumentId, o.userId, o.size, o.price, o.type ?? 'MARKET', o.side, o.status],
  );
  return rows[0].id;
}

/** Acredita pesos al usuario con un CASH_IN FILLED sobre el instrumento MONEDA. */
export async function cashIn(ds: DataSource, userId: number, amount: number): Promise<void> {
  const ars = await cashInstrumentId(ds);
  await createOrder(ds, {
    userId,
    instrumentId: ars,
    side: 'CASH_IN',
    status: 'FILLED',
    size: amount,
    price: '1',
  });
}
