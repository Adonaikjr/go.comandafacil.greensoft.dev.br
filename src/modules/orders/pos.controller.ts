import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  TenantId,
} from '../../common/decorators/current-user.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody } from '../../common/decorators/zod.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { SettingsService } from '../settings/settings.service.js';
import { MenuItemsService } from '../menu-items/menu-items.service.js';
import { OrdersService } from './orders.service.js';
import {
  createOrderAndInvoiceSchema,
  createOrderSchema,
  qrOrderStatusSchema,
  type CreateOrderAndInvoiceDto,
  type CreateOrderDto,
  type QrOrderStatusDto,
} from './dto/order.schema.js';

export const BASIC_PLAN_DAILY_LIMIT = 100;

// Rotas de backend-legado/src/routes/pos.routes.js
@ApiTags('pos')
@ApiCookieAuth('accessToken')
@Scopes(Scope.POS)
@Controller('pos')
export class PosController {
  constructor(
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
    private readonly menu: MenuItemsService,
  ) {}

  @Get('init')
  async init(@TenantId() tenantId: number) {
    const [
      categories,
      paymentTypes,
      printSettings,
      storeSettings,
      storeTables,
      menuItems,
    ] = await Promise.all([
      this.settings.getCategories(tenantId),
      this.settings.getPaymentTypes(tenantId, true),
      this.settings.getPrintRow(tenantId),
      this.settings.getStoreRow(tenantId),
      this.settings.getStoreTables(tenantId),
      this.menu.findAllWithExtras(tenantId),
    ]);
    return {
      categories,
      paymentTypes,
      printSettings,
      storeSettings,
      storeTables,
      menuItems,
    };
  }

  @Post('create-order')
  @HttpCode(200)
  @ZodBody(createOrderSchema)
  async createOrder(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOrderDto,
  ) {
    await this.assertDailyLimit(user);
    const result = await this.orders.createOrder(
      user.tenant_id,
      toOrderInput(dto),
    );
    if (dto.selectedQrOrderItem) {
      await this.orders.setQrOrderStatus(
        user.tenant_id,
        dto.selectedQrOrderItem,
        'completed',
      );
    }
    return {
      success: true,
      message: `Order created. Token: ${result.tokenNo}`,
      ...result,
    };
  }

  @Post('create-order-and-invoice')
  @HttpCode(200)
  @ZodBody(createOrderAndInvoiceSchema)
  async createOrderAndInvoice(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOrderAndInvoiceDto,
  ) {
    await this.assertDailyLimit(user);
    const invoiceId = await this.orders.createInvoice(
      user.tenant_id,
      dto.netTotal,
      dto.taxTotal,
      dto.total,
      dto.paymentTypeId,
    );
    const result = await this.orders.createOrder(user.tenant_id, {
      ...toOrderInput(dto),
      paymentStatus: 'paid',
      invoiceId,
    });
    if (dto.selectedQrOrderItem) {
      await this.orders.setQrOrderStatus(
        user.tenant_id,
        dto.selectedQrOrderItem,
        'completed',
      );
    }
    return {
      success: true,
      message: `Order created. Token: ${result.tokenNo}`,
      ...result,
      invoiceId,
    };
  }

  @Get('qrorders/count')
  async qrOrdersCount(@TenantId() tenantId: number) {
    return {
      status: true,
      totalQROrders: await this.orders.countOpenQrOrders(tenantId),
    };
  }

  @Get('qrorders')
  qrOrders(@TenantId() tenantId: number) {
    return this.orders.getOpenQrOrders(tenantId);
  }

  @Post('qrorders/update-status/:id')
  @HttpCode(200)
  @ZodBody(qrOrderStatusSchema)
  async updateQrOrderStatus(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: QrOrderStatusDto,
  ) {
    await this.orders.setQrOrderStatus(tenantId, id, dto.status);
    return { status: true, message: 'QR Order item status updated.' };
  }

  @Post('qrorders/cancel-all')
  @HttpCode(200)
  async cancelAllQrOrders(@TenantId() tenantId: number) {
    await this.orders.cancelAllQrOrders(tenantId);
    return { status: true, message: 'All QR Order items cleared.' };
  }

  private async assertDailyLimit(user: JwtPayload) {
    if ((user.plan_type || 'basic') !== 'basic') return;
    const count = await this.orders.getDailyOrderCount(user.tenant_id);
    if (count >= BASIC_PLAN_DAILY_LIMIT) {
      throw new HttpException(
        {
          success: false,
          limitReached: true,
          message: `Limite de ${BASIC_PLAN_DAILY_LIMIT} pedidos/dia do plano Básico atingido. Faça upgrade para continuar.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

function toOrderInput(dto: CreateOrderDto) {
  return {
    cart: dto.cart,
    deliveryType: dto.deliveryType,
    customerType: dto.customerType,
    customerId: dto.customerId?.phone || null,
    tableId: dto.tableId || null,
  };
}
