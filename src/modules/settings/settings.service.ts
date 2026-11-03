import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CategoryDto,
  PaymentTypeDto,
  PrintSettingsDto,
  StoreSettingsDto,
  StoreTableDto,
  TaxDto,
} from './dto/settings.schema.js';

export interface StoreTableRow {
  id: number;
  encrypted_id?: string;
  table_title: string | null;
  floor: string | null;
  seating_capacity: number | null;
}

// Também é usado por POS, pedidos, faturas, reservas, QR menu e relatórios
// (equivale às funções exportadas de settings.service.js do legado).
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get encryptionKey() {
    return this.config.get('ENCRYPTION_KEY', { infer: true }) ?? '';
  }

  // ---- Loja ----

  getStoreRow(tenantId: number) {
    return this.prisma.store_details.findUnique({
      where: { tenant_id: tenantId },
    });
  }

  async getCurrency(tenantId: number) {
    const store = await this.prisma.store_details.findUnique({
      where: { tenant_id: tenantId },
      select: { currency: true },
    });
    return store?.currency;
  }

  async getTenantIdFromQRCode(qrcode: string) {
    const store = await this.prisma.store_details.findFirst({
      where: { unique_qr_code: qrcode },
      select: { tenant_id: true },
    });
    return store?.tenant_id;
  }

  async getStoreSettings(tenantId: number) {
    const store = await this.getStoreRow(tenantId);
    return {
      storeName: store?.store_name || null,
      address: store?.address || null,
      phone: store?.phone || null,
      email: store?.email || null,
      currency: store?.currency || null,
      image: store?.image || null,
      isQRMenuEnabled: store?.is_qr_menu_enabled || false,
      isQROrderEnabled: store?.is_qr_order_enabled || false,
      uniqueQRCode: store?.unique_qr_code || null,
      qrMenuTemplate: store?.qr_menu_template || 'm',
    };
  }

  async saveStoreSettings(tenantId: number, dto: StoreSettingsDto) {
    const data = {
      store_name: dto.storeName,
      address: dto.address,
      phone: dto.phone,
      email: dto.email,
      currency: dto.currency,
      is_qr_menu_enabled: dto.isQRMenuEnabled,
      is_qr_order_enabled: dto.isQROrderEnabled,
      qr_menu_template: dto.qrMenuTemplate,
    };
    // O código do QR é gerado só uma vez, no primeiro cadastro
    await this.prisma.store_details.upsert({
      where: { tenant_id: tenantId },
      create: { ...data, unique_qr_code: nanoid(), tenant_id: tenantId },
      update: data,
    });
  }

  async updateStoreImage(tenantId: number, image: string | null) {
    await this.prisma.store_details.upsert({
      where: { tenant_id: tenantId },
      create: { image, unique_qr_code: nanoid(), tenant_id: tenantId },
      update: { image },
    });
  }

  // ---- Impressão ----

  getPrintRow(tenantId: number) {
    return this.prisma.print_settings.findUnique({
      where: { tenant_id: tenantId },
      select: {
        page_format: true,
        header: true,
        footer: true,
        show_notes: true,
        is_enable_print: true,
        show_store_details: true,
        show_customer_details: true,
        print_token: true,
      },
    });
  }

  async getPrintSettings(tenantId: number) {
    const print = await this.getPrintRow(tenantId);
    return {
      pageFormat: print?.page_format || null,
      header: print?.header || null,
      footer: print?.footer || null,
      showNotes: print?.show_notes || null,
      isEnablePrint: print?.is_enable_print || null,
      showStoreDetails: print?.show_store_details || null,
      showCustomerDetails: print?.show_customer_details || null,
      printToken: print?.print_token || null,
    };
  }

  async savePrintSettings(tenantId: number, dto: PrintSettingsDto) {
    const data = {
      page_format: dto.pageFormat,
      header: dto.header,
      footer: dto.footer,
      show_notes: dto.showNotes,
      is_enable_print: dto.isEnablePrint,
      show_store_details: dto.showStoreDetails,
      show_customer_details: dto.showCustomerDetails,
      print_token: dto.printToken,
    };
    await this.prisma.print_settings.upsert({
      where: { tenant_id: tenantId },
      create: { ...data, tenant_id: tenantId },
      update: data,
    });
  }

  // ---- Impostos ----

  getTaxes(tenantId: number) {
    return this.prisma.taxes.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, title: true, rate: true, type: true },
    });
  }

  getTax(tenantId: number, id: number) {
    return this.prisma.taxes.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, title: true, rate: true, type: true },
    });
  }

  async addTax(tenantId: number, dto: TaxDto) {
    const tax = await this.prisma.taxes.create({
      data: {
        title: dto.title,
        rate: dto.rate,
        type: dto.type,
        tenant_id: tenantId,
      },
    });
    return tax.id;
  }

  async updateTax(tenantId: number, id: number, dto: TaxDto) {
    await this.prisma.taxes.updateMany({
      where: { id, tenant_id: tenantId },
      data: { title: dto.title, rate: dto.rate, type: dto.type },
    });
  }

  async deleteTax(tenantId: number, id: number) {
    await this.prisma.taxes.deleteMany({ where: { id, tenant_id: tenantId } });
  }

  // ---- Formas de pagamento ----

  getPaymentTypes(tenantId: number, activeOnly = false) {
    return this.prisma.payment_types.findMany({
      where: { tenant_id: tenantId, ...(activeOnly && { is_active: true }) },
      select: { id: true, title: true, is_active: true },
    });
  }

  async addPaymentType(tenantId: number, dto: PaymentTypeDto) {
    const paymentType = await this.prisma.payment_types.create({
      data: { title: dto.title, is_active: dto.isActive, tenant_id: tenantId },
    });
    return paymentType.id;
  }

  async updatePaymentType(tenantId: number, id: number, dto: PaymentTypeDto) {
    await this.prisma.payment_types.updateMany({
      where: { id, tenant_id: tenantId },
      data: { title: dto.title, is_active: dto.isActive },
    });
  }

  async togglePaymentType(
    tenantId: number,
    id: number,
    isActive: boolean | null,
  ) {
    await this.prisma.payment_types.updateMany({
      where: { id, tenant_id: tenantId },
      data: { is_active: isActive },
    });
  }

  async deletePaymentType(tenantId: number, id: number) {
    await this.prisma.payment_types.deleteMany({
      where: { id, tenant_id: tenantId },
    });
  }

  // ---- Mesas ----

  // O QR code de cada mesa leva o id criptografado com AES no próprio MySQL
  getStoreTables(tenantId: number) {
    return this.prisma.$queryRaw<StoreTableRow[]>`
      SELECT id, HEX(AES_ENCRYPT(HEX(id), ${this.encryptionKey})) AS encrypted_id,
             table_title, floor, seating_capacity
      FROM store_tables
      WHERE tenant_id = ${tenantId}`;
  }

  async getStoreTableByEncryptedId(tenantId: number, encryptedId: string) {
    const rows = await this.prisma.$queryRaw<StoreTableRow[]>`
      SELECT id, table_title, floor, seating_capacity
      FROM store_tables
      WHERE tenant_id = ${tenantId}
        AND AES_DECRYPT(UNHEX(${encryptedId}), ${this.encryptionKey}) = HEX(id)
      LIMIT 1`;
    return rows[0] ?? null;
  }

  async addStoreTable(tenantId: number, dto: StoreTableDto) {
    const table = await this.prisma.store_tables.create({
      data: {
        table_title: dto.title,
        floor: dto.floor,
        seating_capacity: dto.seatingCapacity,
        tenant_id: tenantId,
      },
    });
    return table.id;
  }

  async updateStoreTable(tenantId: number, id: number, dto: StoreTableDto) {
    await this.prisma.store_tables.updateMany({
      where: { id, tenant_id: tenantId },
      data: {
        table_title: dto.title,
        floor: dto.floor,
        seating_capacity: dto.seatingCapacity,
      },
    });
  }

  async deleteStoreTable(tenantId: number, id: number) {
    await this.prisma.store_tables.deleteMany({
      where: { id, tenant_id: tenantId },
    });
  }

  // ---- Categorias ----

  getCategories(tenantId: number) {
    return this.prisma.categories.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, title: true },
    });
  }

  async addCategory(tenantId: number, dto: CategoryDto) {
    const category = await this.prisma.categories.create({
      data: { title: dto.title, tenant_id: tenantId },
    });
    return category.id;
  }

  async updateCategory(tenantId: number, id: number, dto: CategoryDto) {
    await this.prisma.categories.updateMany({
      where: { id, tenant_id: tenantId },
      data: { title: dto.title },
    });
  }

  async deleteCategory(tenantId: number, id: number) {
    await this.prisma.categories.deleteMany({
      where: { id, tenant_id: tenantId },
    });
  }
}
