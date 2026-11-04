import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { nowAsDbDateTime, todayString } from '../../common/utils/db-time.js';
import type { CartItem } from './dto/order.schema.js';
import { calculateSummary, type SummaryItem } from './order-summary.js';
import { priceCart } from './cart-pricing.js';

export interface OrderRow {
  id: number;
  date: Date | null;
  delivery_type: string | null;
  customer_type: string | null;
  customer_id: string | null;
  customer_name: string | null;
  table_id: number | null;
  table_title: string | null;
  floor: string | null;
  status: string | null;
  payment_status: string | null;
  token_no?: number | null;
}
export type ItemRow = SummaryItem & {
  id: number;
  order_id: number;
  addons: unknown;
};

// Conjuntos de colunas dos itens usados por cada tela do legado
const ITEM_COLUMNS = {
  kitchen: Prisma.sql`oi.id, oi.order_id, oi.item_id, mi.title AS item_title, oi.variant_id,
    miv.title AS variant_title, oi.quantity, oi.status, oi.date, oi.addons, oi.notes`,
  list: Prisma.sql`oi.id, oi.order_id, oi.item_id, mi.title AS item_title, oi.variant_id,
    miv.title AS variant_title, oi.price, oi.quantity, oi.status, oi.date, oi.addons, oi.notes`,
  qr: Prisma.sql`oi.id, oi.order_id, oi.item_id, mi.title AS item_title, mi.tax_id,
    t.title AS tax_title, t.rate AS tax_rate, t.type AS tax_type, oi.variant_id,
    miv.title AS variant_title, oi.price, oi.quantity, oi.status, oi.date, oi.addons, oi.notes`,
  summary: Prisma.sql`oi.id, oi.order_id, oi.item_id, mi.title AS item_title, oi.variant_id,
    miv.title AS variant_title, miv.price AS variant_price, mi.price, mi.tax_id,
    t.title AS tax_title, t.rate AS tax_rate, t.type AS tax_type, oi.quantity, oi.status,
    oi.date, oi.addons, oi.notes`,
} as const;

export type ItemColumns = keyof typeof ITEM_COLUMNS;

export interface LoadOrdersOptions {
  source?: 'orders' | 'qr_orders';
  where: Prisma.Sql;
  items: ItemColumns;
}

// Pedidos "ativos" na cozinha/POS: abertos e com data entre ontem e amanhã
export const ACTIVE_ORDERS = Prisma.sql`o.date >= DATE_SUB(NOW(), INTERVAL 1 DAY)
  AND o.date <= DATE_ADD(NOW(), INTERVAL 1 DAY)
  AND o.status NOT IN ('completed', 'cancelled')`;

// O banco de dev é remoto; o timeout padrão (5 s) não basta
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly inventory: InventoryService,
  ) {}

  // Equivale ao par "SELECT pedidos + SELECT itens + SELECT adicionais" que o
  // legado repetia em cada service, já montando order.items[].addons.
  async loadOrders({ source = 'orders', where, items }: LoadOrdersOptions) {
    const isQr = source === 'qr_orders';
    const orders = await this.prisma.$queryRaw<OrderRow[]>`
      SELECT o.id, o.date, o.delivery_type, o.customer_type, o.customer_id,
             c.name AS customer_name, o.table_id, st.table_title, st.floor,
             o.status, o.payment_status ${isQr ? Prisma.empty : Prisma.sql`, o.token_no`}
      FROM ${Prisma.raw(source)} o
      LEFT JOIN customers c ON o.customer_id = c.phone AND c.tenant_id = o.tenant_id
      LEFT JOIN store_tables st ON o.table_id = st.id
      WHERE ${where}`;
    if (!orders.length) return [];

    const orderIds = orders.map((o) => o.id);
    const itemsTable = Prisma.raw(isQr ? 'qr_order_items' : 'order_items');
    const onlyActiveItems =
      items === 'summary'
        ? Prisma.sql`AND oi.status NOT IN ('cancelled')`
        : Prisma.empty;

    const orderItems = await this.prisma.$queryRaw<ItemRow[]>`
      SELECT ${ITEM_COLUMNS[items]}
      FROM ${itemsTable} oi
      LEFT JOIN menu_items mi ON oi.item_id = mi.id
      LEFT JOIN menu_item_variants miv ON oi.item_id = miv.item_id AND oi.variant_id = miv.id
      LEFT JOIN taxes t ON t.id = mi.tax_id
      WHERE oi.order_id IN (${Prisma.join(orderIds)}) ${onlyActiveItems}`;

    const addonIds = [
      ...new Set(orderItems.flatMap((oi) => parseAddonIds(oi.addons))),
    ];
    const addons = addonIds.length
      ? await this.prisma.menu_item_addons.findMany({
          where: { id: { in: addonIds } },
          select: {
            id: true,
            item_id: true,
            title: true,
            price: items === 'summary',
          },
        })
      : [];

    for (const item of orderItems) {
      const ids = parseAddonIds(item.addons);
      if (ids.length)
        item.addons = ids.map((id) => addons.find((a) => a.id == id));
    }

    return orders.map((order) => ({
      ...order,
      items: orderItems.filter((oi) => oi.order_id == order.id),
    }));
  }

  async paymentSummary(where: Prisma.Sql) {
    const orders = await this.loadOrders({ where, items: 'summary' });
    return calculateSummary(orders);
  }

  async getDailyOrderCount(tenantId: number) {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM orders
      WHERE tenant_id = ${tenantId} AND DATE(date) = ${todayString()}`;
    return Number(rows[0]?.count ?? 0);
  }

  // Cria o pedido com a senha (token) do dia. A senha volta a 1 a cada dia
  // (fuso de São Paulo) e é reservada com SELECT ... FOR UPDATE.
  async createOrder(
    tenantId: number,
    input: {
      cart: CartItem[];
      deliveryType: string | null;
      customerType: 'WALKIN' | 'CUSTOMER' | null | undefined;
      customerId: string | null;
      tableId: number | null;
      paymentStatus?: 'pending' | 'paid';
      invoiceId?: number | null;
    },
  ) {
    const today = todayString();
    // Preço e posse dos itens conferidos no cardápio da loja (antes valia o
    // preço enviado pelo cliente e aceitava item de outro tenant)
    const cart = await priceCart(this.prisma, tenantId, input.cart);

    // Garante a linha antes do lock: sem ela o FOR UPDATE não trava nada e
    // dois primeiros pedidos simultâneos da loja davam deadlock. Fica fora da
    // transação de propósito: o INSERT IGNORE de uma linha existente pega um
    // lock compartilhado, que dentro da transação brigaria com o FOR UPDATE.
    await this.prisma.$executeRaw`
      INSERT IGNORE INTO token_sequences (tenant_id, sequence_no, last_updated)
      VALUES (${tenantId}, 0, ${today})`;

    const result = await this.prisma.$transaction(async (tx) => {
      const [sequence] = await tx.$queryRaw<
        { sequence_no: number | null; last_updated: Date | null }[]
      >`
        SELECT sequence_no, last_updated FROM token_sequences
        WHERE tenant_id = ${tenantId} LIMIT 1 FOR UPDATE`;

      const lastDay =
        sequence?.last_updated?.toISOString().slice(0, 10) ?? today;
      const tokenNo =
        (lastDay === today ? (sequence?.sequence_no ?? 0) : 0) + 1;

      const order = await tx.orders.create({
        data: {
          delivery_type: input.deliveryType,
          customer_type: input.customerType ?? undefined,
          customer_id: input.customerId,
          table_id: input.tableId,
          token_no: tokenNo,
          payment_status: input.paymentStatus ?? 'pending',
          invoice_id: input.invoiceId ?? null,
          tenant_id: tenantId,
        },
      });

      await tx.order_items.createMany({
        data: cart.map((item) => ({
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

      await this.inventory.consumeForOrder(tx, tenantId, order.id, cart);

      const lastUpdated = new Date(`${today}T00:00:00Z`);
      await tx.token_sequences.upsert({
        where: { tenant_id: tenantId },
        create: {
          tenant_id: tenantId,
          sequence_no: tokenNo,
          last_updated: lastUpdated,
        },
        update: { sequence_no: tokenNo, last_updated: lastUpdated },
      });

      return { tokenNo, orderId: order.id };
    }, TX_OPTIONS);

    this.realtime.emitToTenant(tenantId, 'new_order', result);
    return result;
  }

  // Número de fatura sequencial por tenant (invoice_sequences, com lock)
  async createInvoice(
    tenantId: number,
    subTotal: number,
    taxTotal: number,
    total: number,
    paymentTypeId?: number | null,
  ) {
    // A forma precisa ser da loja; o título vai copiado para a fatura, para o
    // histórico não mudar se ela for renomeada ou excluída depois.
    const payment = paymentTypeId
      ? await this.prisma.payment_types.findFirst({
          where: { id: paymentTypeId, tenant_id: tenantId },
          select: { id: true, title: true },
        })
      : null;
    if (paymentTypeId && !payment) {
      throw new BadRequestException('Forma de pagamento não encontrada.');
    }

    // Mesma garantia da senha diária (ver createOrder), fora da transação
    await this.prisma.$executeRaw`
      INSERT IGNORE INTO invoice_sequences (tenant_id, sequence_no)
      VALUES (${tenantId}, 0)`;

    return this.prisma.$transaction(async (tx) => {
      const [sequence] = await tx.$queryRaw<{ sequence_no: number | null }[]>`
        SELECT sequence_no FROM invoice_sequences
        WHERE tenant_id = ${tenantId} LIMIT 1 FOR UPDATE`;
      const invoiceId = (sequence?.sequence_no ?? 0) + 1;

      await tx.invoices.create({
        data: {
          id: invoiceId,
          sub_total: subTotal,
          tax_total: taxTotal,
          total,
          payment_type_id: payment?.id ?? null,
          payment_type_title: payment?.title?.slice(0, 100) ?? null,
          created_at: nowAsDbDateTime(),
          tenant_id: tenantId,
        },
      });
      await tx.invoice_sequences.upsert({
        where: { tenant_id: tenantId },
        create: { tenant_id: tenantId, sequence_no: invoiceId },
        update: { sequence_no: invoiceId },
      });
      return invoiceId;
    }, TX_OPTIONS);
  }

  async updateItemStatus(tenantId: number, itemId: number, status: string) {
    await this.prisma.order_items.updateMany({
      where: { id: itemId, tenant_id: tenantId },
      data: { status: status as never },
    });
    this.realtime.emitToTenant(tenantId, 'order_update');
  }

  async setOrdersStatus(
    tenantId: number,
    orderIds: number[],
    status: 'completed' | 'cancelled',
  ) {
    await this.prisma.orders.updateMany({
      where: { id: { in: orderIds }, tenant_id: tenantId },
      data: { status },
    });
    if (status === 'cancelled') {
      await this.inventory.restockCancelledOrders(tenantId, orderIds);
    }
    this.realtime.emitToTenant(tenantId, 'order_update');
  }

  async completeAndPay(
    tenantId: number,
    orderIds: number[],
    invoiceId: number,
  ) {
    await this.prisma.orders.updateMany({
      where: { id: { in: orderIds }, tenant_id: tenantId },
      data: {
        status: 'completed',
        payment_status: 'paid',
        invoice_id: invoiceId,
      },
    });
    // Com REALTIME_SERVER_EVENTS o backend avisa a cozinha/pedidos sozinho
    this.realtime.emitToTenant(tenantId, 'order_update');
  }

  // ---- Pedidos via QR code (aguardando confirmação no POS) ----

  async countOpenQrOrders(tenantId: number) {
    return this.prisma.qr_orders.count({
      where: {
        tenant_id: tenantId,
        status: { notIn: ['completed', 'cancelled'] },
      },
    });
  }

  getOpenQrOrders(tenantId: number) {
    return this.loadOrders({
      source: 'qr_orders',
      where: Prisma.sql`o.status NOT IN ('completed', 'cancelled') AND o.tenant_id = ${tenantId}`,
      items: 'qr',
    });
  }

  async setQrOrderStatus(
    tenantId: number,
    orderId: number,
    status: 'created' | 'completed' | 'cancelled',
  ) {
    await this.prisma.qr_orders.updateMany({
      where: { id: orderId, tenant_id: tenantId },
      data: { status },
    });
  }

  async cancelAllQrOrders(tenantId: number) {
    await this.prisma.qr_orders.updateMany({
      where: { tenant_id: tenantId },
      data: { status: 'cancelled' },
    });
  }
}

function parseAddonIds(value: unknown): number[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const ids = JSON.parse(value) as unknown;
    return Array.isArray(ids) ? ids.map(Number) : [];
  } catch {
    return [];
  }
}
