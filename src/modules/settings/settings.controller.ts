import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/current-user.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody } from '../../common/decorators/zod.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import { SettingsService } from './settings.service.js';
import {
  categorySchema,
  paymentTypeSchema,
  printSettingsSchema,
  storeSettingsSchema,
  storeTableSchema,
  taxSchema,
  togglePaymentTypeSchema,
  type CategoryDto,
  type PaymentTypeDto,
  type PrintSettingsDto,
  type StoreSettingsDto,
  type StoreTableDto,
  type TaxDto,
  type TogglePaymentTypeDto,
} from './dto/settings.schema.js';

// Rotas de backend-legado/src/routes/settings.routes.js
@ApiTags('settings')
@ApiCookieAuth('accessToken')
@Scopes(Scope.SETTINGS)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('store-setting')
  getStoreSettings(@TenantId() tenantId: number) {
    return this.settings.getStoreSettings(tenantId);
  }

  @Post('store-setting')
  @HttpCode(200)
  @ZodBody(storeSettingsSchema)
  async saveStoreSettings(
    @TenantId() tenantId: number,
    @Body() dto: StoreSettingsDto,
  ) {
    await this.settings.saveStoreSettings(tenantId, dto);
    return { success: true, message: 'Details Saved Successfully.' };
  }

  @Get('print-setting')
  getPrintSettings(@TenantId() tenantId: number) {
    return this.settings.getPrintSettings(tenantId);
  }

  @Post('print-setting')
  @HttpCode(200)
  @ZodBody(printSettingsSchema)
  async savePrintSettings(
    @TenantId() tenantId: number,
    @Body() dto: PrintSettingsDto,
  ) {
    await this.settings.savePrintSettings(tenantId, dto);
    return { success: true, message: 'Details Saved Successfully.' };
  }

  // ---- Impostos ----

  @Get('taxes')
  getTaxes(@TenantId() tenantId: number) {
    return this.settings.getTaxes(tenantId);
  }

  @Post('taxes/add')
  @HttpCode(200)
  @ZodBody(taxSchema)
  async addTax(@TenantId() tenantId: number, @Body() dto: TaxDto) {
    const taxId = await this.settings.addTax(tenantId, dto);
    return { success: true, message: 'Tax Details Added.', taxId };
  }

  @Post('taxes/:id/update')
  @HttpCode(200)
  @ZodBody(taxSchema)
  async updateTax(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TaxDto,
  ) {
    await this.settings.updateTax(tenantId, id, dto);
    return {
      success: true,
      message: 'Tax Details Updated.',
      taxId: String(id),
    };
  }

  @Get('taxes/:id')
  async getTax(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    // O legado devolvia o array do SELECT, com 0 ou 1 linha
    const tax = await this.settings.getTax(tenantId, id);
    return tax ? [tax] : [];
  }

  @Delete('taxes/:id')
  async deleteTax(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.settings.deleteTax(tenantId, id);
    return { success: true, message: 'Tax Detail Removed.', taxId: String(id) };
  }

  // ---- Formas de pagamento ----

  @Post('payment-types/add')
  @HttpCode(200)
  @ZodBody(paymentTypeSchema)
  async addPaymentType(
    @TenantId() tenantId: number,
    @Body() dto: PaymentTypeDto,
  ) {
    const id = await this.settings.addPaymentType(tenantId, dto);
    return { success: true, message: 'Payment Type Added.', id };
  }

  @Get('payment-types')
  getPaymentTypes(@TenantId() tenantId: number) {
    return this.settings.getPaymentTypes(tenantId);
  }

  @Post('payment-types/:id/update')
  @HttpCode(200)
  @ZodBody(paymentTypeSchema)
  async updatePaymentType(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentTypeDto,
  ) {
    await this.settings.updatePaymentType(tenantId, id, dto);
    return { success: true, message: 'Payment Type Updated.' };
  }

  @Post('payment-types/:id/toggle')
  @HttpCode(200)
  @ZodBody(togglePaymentTypeSchema)
  async togglePaymentType(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TogglePaymentTypeDto,
  ) {
    await this.settings.togglePaymentType(tenantId, id, dto.isActive);
    return { success: true, message: 'Payment Type Status Updated.' };
  }

  @Delete('payment-types/:id')
  async deletePaymentType(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.settings.deletePaymentType(tenantId, id);
    return { success: true, message: 'Payment Type Deleted.', id: String(id) };
  }

  // ---- Mesas ----

  @Post('store-tables/add')
  @HttpCode(200)
  @ZodBody(storeTableSchema)
  async addStoreTable(
    @TenantId() tenantId: number,
    @Body() dto: StoreTableDto,
  ) {
    const id = await this.settings.addStoreTable(tenantId, dto);
    return { success: true, message: 'Store Table Added.', id };
  }

  @Get('store-tables')
  getStoreTables(@TenantId() tenantId: number) {
    return this.settings.getStoreTables(tenantId);
  }

  @Post('store-tables/:id/update')
  @HttpCode(200)
  @ZodBody(storeTableSchema)
  async updateStoreTable(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StoreTableDto,
  ) {
    await this.settings.updateStoreTable(tenantId, id, dto);
    return { success: true, message: 'Store Table Details Updated.' };
  }

  @Delete('store-tables/:id')
  async deleteStoreTable(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.settings.deleteStoreTable(tenantId, id);
    return { success: true, message: 'Store Table Details Deleted.' };
  }

  // ---- Categorias ----

  @Post('categories/add')
  @HttpCode(200)
  @ZodBody(categorySchema)
  async addCategory(@TenantId() tenantId: number, @Body() dto: CategoryDto) {
    const id = await this.settings.addCategory(tenantId, dto);
    return { success: true, message: 'Category Added.', id };
  }

  @Get('categories')
  getCategories(@TenantId() tenantId: number) {
    return this.settings.getCategories(tenantId);
  }

  @Post('categories/:id/update')
  @HttpCode(200)
  @ZodBody(categorySchema)
  async updateCategory(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CategoryDto,
  ) {
    await this.settings.updateCategory(tenantId, id, dto);
    return { success: true, message: 'Category Updated.' };
  }

  @Delete('categories/:id')
  async deleteCategory(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.settings.deleteCategory(tenantId, id);
    return { success: true, message: 'Category Deleted.' };
  }
}
