import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CartItem } from './dto/order.schema.js';

// O preço de cada linha vem do cardápio da loja, nunca do corpo da requisição:
// preço da variação (ou do item) + adicionais, a mesma conta do app e do web.
// Item, variação ou adicional de outra loja derruba o pedido com 400.
export async function priceCart(
  prisma: PrismaService,
  tenantId: number,
  cartItems: CartItem[],
): Promise<CartItem[]> {
  const itemIds = [...new Set(cartItems.map((item) => item.id))];
  const [items, variants, addons] = await Promise.all([
    prisma.menu_items.findMany({
      where: { id: { in: itemIds }, tenant_id: tenantId },
      select: { id: true, price: true },
    }),
    prisma.menu_item_variants.findMany({
      where: { item_id: { in: itemIds }, tenant_id: tenantId },
      select: { id: true, item_id: true, price: true },
    }),
    prisma.menu_item_addons.findMany({
      where: { item_id: { in: itemIds }, tenant_id: tenantId },
      select: { id: true, item_id: true, price: true },
    }),
  ]);

  const invalid = () => new BadRequestException('Item inválido no pedido.');
  return cartItems.map((cartItem) => {
    const item = items.find((i) => i.id === cartItem.id);
    if (!item) throw invalid();

    let price = Number(item.price ?? 0);
    if (cartItem.variant_id) {
      const variant = variants.find(
        (v) => v.id === cartItem.variant_id && v.item_id === item.id,
      );
      if (!variant) throw invalid();
      price = Number(variant.price);
    }
    for (const addonId of cartItem.addons_ids ?? []) {
      const addon = addons.find(
        (a) => a.id === addonId && a.item_id === item.id,
      );
      if (!addon) throw invalid();
      price += Number(addon.price);
    }
    return { ...cartItem, price };
  });
}
