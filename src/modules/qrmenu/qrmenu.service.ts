import { Injectable } from '@nestjs/common';
import { hasProAccess } from '../../common/utils/plan.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type { CartItem } from '../orders/dto/order.schema.js';
import { priceCart } from '../orders/cart-pricing.js';

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
    // Rota pública: o preço sempre vem do cardápio da loja
    const cartItems = await priceCart(this.prisma, tenantId, input.cartItems);
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
