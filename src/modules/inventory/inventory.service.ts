import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  nowAsDbDateTime,
  parseDbDateTime,
} from '../../common/utils/db-time.js';
import type {
  CreateInventoryItemDto,
  CreateMovementDto,
  ListInventoryQuery,
  ListMovementsQuery,
  UpdateInventoryItemDto,
} from './dto/inventory.schema.js';

type Tx = Prisma.TransactionClient;
type MovementType = 'entry' | 'exit' | 'adjustment' | 'sale' | 'sale_return';

// O banco de dev é remoto; o timeout padrão (5 s) não basta
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

const itemInclude = {
  menu_items: { select: { title: true } },
} as const;

type ItemWithMenu = Prisma.inventory_itemsGetPayload<{
  include: typeof itemInclude;
}>;

function toRow({ menu_items, ...item }: ItemWithMenu) {
  return {
    ...item,
    menu_item_title: menu_items?.title ?? null,
    low_stock: item.quantity.lte(item.min_quantity),
  };
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: number, query: ListInventoryQuery) {
    const items = await this.prisma.inventory_items.findMany({
      where: {
        tenant_id: tenantId,
        ...(query.filter ? { title: { contains: query.filter } } : {}),
      },
      include: itemInclude,
      orderBy: { title: 'asc' },
    });
    const rows = items.map(toRow);
    return query.lowStock ? rows.filter((row) => row.low_stock) : rows;
  }

  async findOne(tenantId: number, id: number) {
    const item = await this.prisma.inventory_items.findFirst({
      where: { id, tenant_id: tenantId },
      include: itemInclude,
    });
    if (!item) throw new NotFoundException('Inventory item not found!');
    return toRow(item);
  }

  async create(
    tenantId: number,
    dto: CreateInventoryItemDto,
    username: string,
  ) {
    await this.assertMenuItem(tenantId, dto.menuItemId);

    return this.prisma.$transaction(async (tx) => {
      const now = nowAsDbDateTime();
      const item = await tx.inventory_items.create({
        data: {
          tenant_id: tenantId,
          title: dto.title,
          unit: dto.unit,
          min_quantity: dto.minQuantity,
          cost_price: dto.costPrice,
          menu_item_id: dto.menuItemId,
          created_at: now,
          updated_at: now,
        },
      });
      if (dto.quantity > 0) {
        await this.applyDelta(tx, tenantId, item.id, () => dto.quantity, {
          type: 'entry',
          notes: 'Saldo inicial',
          username,
        });
      }
      return item.id;
    }, TX_OPTIONS);
  }

  async update(tenantId: number, id: number, dto: UpdateInventoryItemDto) {
    await this.assertMenuItem(tenantId, dto.menuItemId, id);
    const { count } = await this.prisma.inventory_items.updateMany({
      where: { id, tenant_id: tenantId },
      data: {
        title: dto.title,
        unit: dto.unit,
        min_quantity: dto.minQuantity,
        cost_price: dto.costPrice,
        menu_item_id: dto.menuItemId,
        updated_at: nowAsDbDateTime(),
      },
    });
    if (!count) throw new NotFoundException('Inventory item not found!');
  }

  async remove(tenantId: number, id: number) {
    const { count } = await this.prisma.inventory_items.deleteMany({
      where: { id, tenant_id: tenantId },
    });
    if (!count) throw new NotFoundException('Inventory item not found!');
  }

  // Entrada, saída ou ajuste (contagem) feito à mão. Retorna o novo saldo.
  addMovement(
    tenantId: number,
    id: number,
    dto: CreateMovementDto,
    username: string,
  ) {
    return this.prisma.$transaction(
      (tx) =>
        this.applyDelta(
          tx,
          tenantId,
          id,
          (current) => {
            if (dto.type === 'entry') return dto.quantity;
            if (dto.type === 'adjustment')
              return new Prisma.Decimal(dto.quantity).minus(current);
            if (current.lessThan(dto.quantity)) {
              throw new BadRequestException('Insufficient stock!');
            }
            return -dto.quantity;
          },
          { type: dto.type, notes: dto.notes, username },
        ),
      TX_OPTIONS,
    );
  }

  async listMovements(tenantId: number, query: ListMovementsQuery) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = parseDbDateTime(query.from);
    if (query.to) {
      const end = parseDbDateTime(query.to);
      end.setUTCDate(end.getUTCDate() + 1);
      createdAt.lt = end;
    }

    const where: Prisma.inventory_movementsWhereInput = {
      tenant_id: tenantId,
      inventory_item_id: query.itemId,
      type: query.type,
      ...(query.from || query.to ? { created_at: createdAt } : {}),
    };

    const [movements, total] = await Promise.all([
      this.prisma.inventory_movements.findMany({
        where,
        include: { inventory_items: { select: { title: true, unit: true } } },
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      this.prisma.inventory_movements.count({ where }),
    ]);

    return {
      movements: movements.map(({ inventory_items, ...m }) => ({
        ...m,
        item_title: inventory_items.title,
        unit: inventory_items.unit,
      })),
      currentPage: query.page,
      perPage: query.perPage,
      totalPages: Math.ceil(total / query.perPage),
      totalMovements: total,
    };
  }

  // ---- Integração com pedidos ----

  // Baixa o estoque dos produtos vendidos. Roda dentro da transação que cria
  // o pedido; o saldo pode ficar negativo para nunca travar uma venda.
  async consumeForOrder(
    tx: Tx,
    tenantId: number,
    orderId: number,
    cart: { id: number; quantity: number }[],
  ) {
    const soldByMenuItem = new Map<number, number>();
    for (const line of cart) {
      soldByMenuItem.set(
        line.id,
        (soldByMenuItem.get(line.id) ?? 0) + line.quantity,
      );
    }

    const items = await tx.inventory_items.findMany({
      where: {
        tenant_id: tenantId,
        menu_item_id: { in: [...soldByMenuItem.keys()] },
      },
      select: { id: true, menu_item_id: true },
    });

    for (const item of items) {
      const sold = soldByMenuItem.get(item.menu_item_id!) ?? 0;
      await this.applyDelta(tx, tenantId, item.id, () => -sold, {
        type: 'sale',
        orderId,
      });
    }
  }

  // Devolve ao estoque o que foi baixado pelas vendas dos pedidos cancelados.
  // Pedidos já devolvidos são ignorados (cancelar duas vezes não duplica).
  async restockCancelledOrders(tenantId: number, orderIds: number[]) {
    await this.prisma.$transaction(async (tx) => {
      const movements = await tx.inventory_movements.findMany({
        where: {
          tenant_id: tenantId,
          order_id: { in: orderIds },
          type: { in: ['sale', 'sale_return'] },
        },
        select: {
          inventory_item_id: true,
          order_id: true,
          type: true,
          quantity: true,
        },
      });
      const returned = new Set(
        movements
          .filter((m) => m.type === 'sale_return')
          .map((m) => `${m.order_id}:${m.inventory_item_id}`),
      );

      for (const sale of movements) {
        const key = `${sale.order_id}:${sale.inventory_item_id}`;
        if (sale.type !== 'sale' || returned.has(key)) continue;
        returned.add(key);
        await this.applyDelta(
          tx,
          tenantId,
          sale.inventory_item_id,
          () => sale.quantity.negated(),
          { type: 'sale_return', orderId: sale.order_id },
        );
      }
    }, TX_OPTIONS);
  }

  // ---- Internos ----

  // Trava a linha do item (FOR UPDATE), aplica a variação e grava o histórico
  private async applyDelta(
    tx: Tx,
    tenantId: number,
    itemId: number,
    delta: (current: Prisma.Decimal) => Prisma.Decimal | number,
    movement: {
      type: MovementType;
      orderId?: number | null;
      notes?: string | null;
      username?: string | null;
    },
  ) {
    const [row] = await tx.$queryRaw<{ quantity: unknown }[]>`
      SELECT quantity FROM inventory_items
      WHERE id = ${itemId} AND tenant_id = ${tenantId} FOR UPDATE`;
    if (!row) throw new NotFoundException('Inventory item not found!');

    const current = new Prisma.Decimal(String(row.quantity));
    const change = new Prisma.Decimal(delta(current));
    const balance = current.plus(change);
    const now = nowAsDbDateTime();

    await tx.inventory_items.update({
      where: { id: itemId },
      data: { quantity: balance, updated_at: now },
    });
    await tx.inventory_movements.create({
      data: {
        tenant_id: tenantId,
        inventory_item_id: itemId,
        type: movement.type,
        quantity: change,
        balance,
        order_id: movement.orderId ?? null,
        notes: movement.notes ?? null,
        username: movement.username ?? null,
        created_at: now,
      },
    });
    return balance;
  }

  // O produto precisa ser do tenant e ainda não ter outro item de estoque
  private async assertMenuItem(
    tenantId: number,
    menuItemId: number | null,
    currentId?: number,
  ) {
    if (menuItemId == null) return;
    const [menuItem, linked] = await Promise.all([
      this.prisma.menu_items.findFirst({
        where: { id: menuItemId, tenant_id: tenantId },
        select: { id: true },
      }),
      this.prisma.inventory_items.findFirst({
        where: {
          tenant_id: tenantId,
          menu_item_id: menuItemId,
          ...(currentId ? { id: { not: currentId } } : {}),
        },
        select: { id: true },
      }),
    ]);
    if (!menuItem) throw new BadRequestException('Menu item not found!');
    if (linked) {
      throw new BadRequestException(
        'This menu item is already linked to another inventory item!',
      );
    }
  }
}
