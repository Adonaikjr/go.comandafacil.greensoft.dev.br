import { calculateSummary } from './order-summary.js';

describe('calculateSummary', () => {
  it('imposto exclusivo soma ao total', () => {
    const result = calculateSummary([
      {
        items: [
          {
            price: '10.00',
            quantity: 2,
            tax_rate: 10,
            tax_type: 'exclusive',
            addons: [{ price: '1.00' }],
          },
        ],
      },
    ]);
    expect(result.subtotal).toBe(22);
    expect(result.taxTotal).toBe(2);
    expect(result.total).toBe(24);
    expect(result.orders[0].items[0].price).toBe(12);
  });

  it('imposto inclusivo fica dentro do preço', () => {
    const result = calculateSummary([
      {
        items: [
          {
            price: '110.00',
            quantity: 1,
            tax_rate: 10,
            tax_type: 'inclusive',
            addons: null,
          },
        ],
      },
    ]);
    expect(result.total).toBe(110);
    expect(result.taxTotal).toBeCloseTo(10);
    expect(result.subtotal).toBeCloseTo(100);
  });

  it('usa o preço da variação quando existe', () => {
    const result = calculateSummary([
      {
        items: [
          {
            price: '10.00',
            variant_price: '15.00',
            quantity: 1,
            tax_type: null,
          },
        ],
      },
    ]);
    expect(result.total).toBe(15);
  });
});
