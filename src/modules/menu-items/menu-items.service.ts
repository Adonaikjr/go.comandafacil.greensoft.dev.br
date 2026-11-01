import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MenuItemDto, MenuItemExtraDto } from './dto/menu-item.schema.js';

export interface MenuItemRow {
  id: number;
  title: string | null;
  price: Prisma.Decimal | null;
  net_price: Prisma.Decimal | null;
  tax_id: number | null;
  tax_title: string | null;
  tax_rate: number | null;
  tax_type: string | null;
  category_id: number | null;
  category_title: string | null;
  image: string | null;
}

const extraSelect = {
  id: true,
  item_id: true,
  title: true,
  price: true,
} as const;

// Também usado pelo POS e pelo QR menu (lista completa com adicionais/variações)
@Injectable()
export class MenuItemsService {
  constructor(private readonly prisma: PrismaService) {}

  private selectItems(where: Prisma.Sql) {
    return this.prisma.$queryRaw<MenuItemRow[]>`
      SELECT i.id, i.title, price, net_price, tax_id,
             t.title AS tax_title, t.rate AS tax_rate, t.type AS tax_type,
             category AS category_id, c.title AS category_title, image
      FROM menu_items i
      LEFT JOIN taxes t ON i.tax_id = t.id
      LEFT JOIN categories c ON i.category = c.id
      WHERE ${where}`;
  }

  async findAllWithExtras(tenantId: number) {
    const [items, addons, variants] = await Promise.all([
      this.selectItems(Prisma.sql`i.tenant_id = ${tenantId}`),
      this.getAllAddons(tenantId),
      this.getAllVariants(tenantId),
    ]);
    return items.map((item) => ({
      ...item,
      addons: addons.filter((addon) => addon.item_id == item.id),
      variants: variants.filter((variant) => variant.item_id == item.id),
    }));
  }

  async findOneWithExtras(tenantId: number, id: number) {
    const [items, addons, variants] = await Promise.all([
      this.selectItems(Prisma.sql`i.id = ${id} AND i.tenant_id = ${tenantId}`),
      this.getAddons(tenantId, id),
      this.getVariants(tenantId, id),
    ]);
    return { ...items[0], addons, variants };
  }

  async create(tenantId: number, dto: MenuItemDto) {
    const item = await this.prisma.menu_items.create({
      data: {
        title: dto.title,
        price: dto.price,
        net_price: dto.netPrice,
        tax_id: dto.taxId,
        category: dto.categoryId,
        tenant_id: tenantId,
      },
    });
    return item.id;
  }

  async update(tenantId: number, id: number, dto: MenuItemDto) {
    await this.prisma.menu_items.updateMany({
      where: { id, tenant_id: tenantId },
      data: {
        title: dto.title,
        price: dto.price,
        net_price: dto.netPrice,
        tax_id: dto.taxId,
        category: dto.categoryId,
      },
    });
  }

  async updateImage(tenantId: number, id: number, image: string | null) {
    await this.prisma.menu_items.updateMany({
      where: { id, tenant_id: tenantId },
      data: { image },
    });
  }

  async remove(tenantId: number, id: number) {
    await this.prisma.menu_items.deleteMany({
      where: { id, tenant_id: tenantId },
    });
  }

  // ---- Adicionais ----

  getAddons(tenantId: number, itemId: number) {
    return this.prisma.menu_item_addons.findMany({
      where: { item_id: itemId, tenant_id: tenantId },
      select: extraSelect,
    });
  }

  getAllAddons(tenantId: number) {
    return this.prisma.menu_item_addons.findMany({
      where: { tenant_id: tenantId },
      select: extraSelect,
    });
  }

  async addAddon(tenantId: number, itemId: number, dto: MenuItemExtraDto) {
    const addon = await this.prisma.menu_item_addons.create({
      data: {
        item_id: itemId,
        title: dto.title,
        price: dto.price,
        tenant_id: tenantId,
      },
    });
    return addon.id;
  }

  async updateAddon(
    tenantId: number,
    itemId: number,
    addonId: number,
    dto: MenuItemExtraDto,
  ) {
    await this.prisma.menu_item_addons.updateMany({
      where: { id: addonId, item_id: itemId, tenant_id: tenantId },
      data: { title: dto.title, price: dto.price },
    });
  }

  async deleteAddon(tenantId: number, itemId: number, addonId: number) {
    await this.prisma.menu_item_addons.deleteMany({
      where: { id: addonId, item_id: itemId, tenant_id: tenantId },
    });
  }

  // ---- Variações ----

  getVariants(tenantId: number, itemId: number) {
    return this.prisma.menu_item_variants.findMany({
      where: { item_id: itemId, tenant_id: tenantId },
      select: extraSelect,
    });
  }

  getAllVariants(tenantId: number) {
    return this.prisma.menu_item_variants.findMany({
      where: { tenant_id: tenantId },
      select: extraSelect,
    });
  }

  async addVariant(tenantId: number, itemId: number, dto: MenuItemExtraDto) {
    const variant = await this.prisma.menu_item_variants.create({
      data: {
        item_id: itemId,
        title: dto.title,
        price: dto.price,
        tenant_id: tenantId,
      },
    });
    return variant.id;
  }

  async updateVariant(
    tenantId: number,
    itemId: number,
    variantId: number,
    dto: MenuItemExtraDto,
  ) {
    await this.prisma.menu_item_variants.updateMany({
      where: { id: variantId, item_id: itemId, tenant_id: tenantId },
      data: { title: dto.title, price: dto.price },
    });
  }

  async deleteVariant(tenantId: number, itemId: number, variantId: number) {
    await this.prisma.menu_item_variants.deleteMany({
      where: { id: variantId, item_id: itemId, tenant_id: tenantId },
    });
  }
}
