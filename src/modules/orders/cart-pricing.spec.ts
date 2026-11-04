import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CartItem } from './dto/order.schema.js';
import { priceCart } from './cart-pricing.js';

const line = (fields: Partial<CartItem>): CartItem => ({
  id: 1,
  price: 1,
  quantity: 1,
  variant_id: null,
  notes: null,
  ...fields,
});

const prisma = {
  menu_items: { findMany: async () => [{ id: 1, price: 50 }] },
  menu_item_variants: {
    findMany: async () => [{ id: 10, item_id: 1, price: 70 }],
  },
  menu_item_addons: {
    findMany: async () => [{ id: 20, item_id: 1, price: 5 }],
  },
} as unknown as PrismaService;

describe('priceCart', () => {
  it('ignora o preço enviado e soma variação + adicionais do cardápio', async () => {
    const [plain, full] = await priceCart(prisma, 1, [
      line({ price: 0.01 }),
      line({ price: 0.01, quantity: 2, variant_id: 10, addons_ids: [20] }),
    ]);
    expect(plain.price).toBe(50);
    expect(full.price).toBe(75);
  });

  it('recusa item, variação ou adicional fora da loja', async () => {
    await expect(
      priceCart(prisma, 1, [line({ id: 2 })]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      priceCart(prisma, 1, [line({ variant_id: 99 })]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      priceCart(prisma, 1, [line({ addons_ids: [99] })]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
