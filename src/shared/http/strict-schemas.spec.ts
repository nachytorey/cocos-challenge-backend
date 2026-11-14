import { CancelOrderParams } from '../../orders/orders.schemas';
import { PortfolioParams } from '../../portfolio/portfolio.schemas';
import { SearchQuery } from '../../instruments/instruments.schemas';
import { NoQuery } from './validate';

describe('schemas estrictos (principio III: los campos desconocidos se rechazan)', () => {
  it('NoQuery acepta una query vacía y rechaza cualquier parámetro', () => {
    expect(NoQuery.safeParse({}).success).toBe(true);
    expect(NoQuery.safeParse({ x: '1' }).success).toBe(false);
  });

  it('SearchQuery rechaza parámetros desconocidos y acepta los suyos', () => {
    expect(SearchQuery.safeParse({ q: 'a', limit: '5' }).success).toBe(true);
    expect(SearchQuery.safeParse({ q: 'a', foo: '1' }).success).toBe(false);
  });

  it('los params de portfolio y de cancelación rechazan claves desconocidas', () => {
    expect(PortfolioParams.safeParse({ userId: '1' }).success).toBe(true);
    expect(PortfolioParams.safeParse({ userId: '1', extra: 'x' }).success).toBe(false);
    expect(CancelOrderParams.safeParse({ orderId: '5' }).success).toBe(true);
    expect(CancelOrderParams.safeParse({ orderId: '5', extra: 'x' }).success).toBe(false);
  });
});
