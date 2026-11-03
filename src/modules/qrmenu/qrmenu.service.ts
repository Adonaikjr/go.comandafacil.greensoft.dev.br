import { BadRequestException, Injectable } from '@nestjs/common';
import { hasProAccess } from '../../common/utils/plan.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type { CartItem } from '../orders/dto/order.schema.js';

@Injectable()
export class QrMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async tenantHasPro(tenantId: number) {
    const tenant = await this.prisma.tenants.findUnique({
      where: { id: tenantId },
      select: { is_active: true, trial_started_at: true },
    });
    return !!tenant && hasProAccess(tenant);
  }

  // A rota é pública: o preço vem do cardápio da loja, nunca do corpo da
  // requisição. Item, variação ou adicional de fora da loja derruba o pedido.
  private async priceCart(tenantId: number, cartItems: CartItem[]) {
    const itemIds = [...new Set(cartItems.map((item) => item.id))];
    const [items, variants, addons] = await Promise.all([
      this.prisma.menu_items.findMany({
        where: { id: { in: itemIds }, tenant_id: tenantId },
        select: { id: true, price: true },
      }),
      this.prisma.menu_item_variants.findMany({
        where: { item_id: { in: itemIds }, tenant_id: tenantId },
        select: { id: true, item_id: true, price: true },
      }),
      this.prisma.menu_item_addons.findMany({
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

  // Pedido feito pelo cliente no cardápio digital; fica em qr_orders até o POS
  // aceitar. Cadastra o cliente pelo telefone se ainda não existir.
  async placeOrder(
    tenantId: number,
    input: {
      deliveryType: string | null;
      cartItems: CartItem[];
      customerType: 'WALKIN' | 'CUSTOMER' | null | undefined;
      phone: string | null;
      name: string | null;
      tableId: number | null;
    },
  ) {
    const cartItems = await this.priceCart(tenantId, input.cartItems);
    const orderId = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.qr_orders.create({
          data: {
            delivery_type: input.deliveryType,
            customer_type: input.customerType ?? undefined,
            customer_id: input.phone,
            table_id: input.tableId,
            payment_status: 'pending',
            tenant_id: tenantId,
          },
        });

        await tx.qr_order_items.createMany({
          data: cartItems.map((item) => ({
            order_id: order.id,
            item_id: item.id,
            variant_id: item.variant_id,
            price: item.price,
            quantity: item.quantity,
            notes: item.notes,
            addons: item.addons_ids?.length
              ? JSON.stringify(item.addons_ids)
              : null,
            tenant_id: tenantId,
          })),
        });

        if (input.phone) {
          const existing = await tx.customers.findUnique({
            where: {
              phone_tenant_id: { phone: input.phone, tenant_id: tenantId },
            },
            select: { phone: true },
          });
          if (!existing) {
            await tx.customers.create({
              data: {
                phone: input.phone,
                name: input.name ?? '',
                tenant_id: tenantId,
              },
            });
          }
        }
        return order.id;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );

    this.realtime.emitToTenant(tenantId, 'new_qrorder', { orderId });
    return orderId;
  }
}
