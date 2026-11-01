import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CartItem } from '../orders/dto/order.schema.js';

@Injectable()
export class QrMenuService {
  constructor(private readonly prisma: PrismaService) {}

  // Pedido feito pelo cliente no cardápio digital; fica em qr_orders até o POS
  // aceitar. Cadastra o cliente pelo telefone se ainda não existir.
  placeOrder(
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
    return this.prisma.$transaction(
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
          data: input.cartItems.map((item) => ({
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
  }
}
