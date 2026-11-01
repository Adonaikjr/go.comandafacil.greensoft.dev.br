// Cálculo do resumo de pagamento, igual ao de orders.controller.js /
// invoice.controller.js do legado (inclusive o arredondamento: nenhum).

export interface SummaryAddon {
  price?: unknown;
}

export interface SummaryItem {
  variant_price?: unknown;
  price?: unknown;
  tax_rate?: unknown;
  tax_type?: string | null;
  quantity?: unknown;
  addons?: (SummaryAddon | undefined)[] | string | null;
  itemTotal?: number;
  [key: string]: unknown;
}

export interface SummaryOrder {
  items: SummaryItem[];
  [key: string]: unknown;
}

export function calculateSummary<T extends SummaryOrder>(orders: T[]) {
  let subtotal = 0;
  let taxTotal = 0;
  let total = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const quantity = Number(item.quantity);
      const taxRate = Number(item.tax_rate);
      const addons = Array.isArray(item.addons) ? item.addons : [];
      const addonsTotal = addons.reduce(
        (sum, addon) => sum + Number(addon?.price),
        0,
      );
      const itemPrice =
        Number(item.variant_price ? item.variant_price : item.price) * quantity;

      let unitPrice: number;
      if (item.tax_type == 'exclusive') {
        const tax = (itemPrice * taxRate) / 100;
        const priceWithTax = itemPrice + tax;
        taxTotal += tax;
        subtotal += itemPrice + addonsTotal * quantity;
        total += priceWithTax + addonsTotal * quantity;
        unitPrice = priceWithTax / quantity + addonsTotal;
      } else if (item.tax_type == 'inclusive') {
        const tax = itemPrice - itemPrice * (100 / (100 + taxRate));
        taxTotal += tax;
        subtotal += itemPrice - tax + addonsTotal * quantity;
        total += itemPrice + addonsTotal * quantity;
        unitPrice = itemPrice / quantity + addonsTotal;
      } else {
        subtotal += itemPrice + addonsTotal * quantity;
        total += itemPrice + addonsTotal * quantity;
        unitPrice = itemPrice / quantity + addonsTotal;
      }
      item.itemTotal = unitPrice;
      item.price = unitPrice;
    }
  }

  return { subtotal, taxTotal, total, orders };
}
