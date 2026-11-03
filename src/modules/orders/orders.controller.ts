import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '../../generated/prisma/client.js';
import { TenantId } from '../../common/decorators/current-user.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody } from '../../common/decorators/zod.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import { SettingsService } from '../settings/settings.service.js';
import { ACTIVE_ORDERS, OrdersService } from './orders.service.js';
import {
  itemStatusSchema,
  orderIdsSchema,
  payOrdersSchema,
  type ItemStatusDto,
  type OrderIdsDto,
  type PayOrdersDto,
} from './dto/order.schema.js';

type LoadedOrder = Awaited<ReturnType<OrdersService['loadOrders']>>[number];

// Rotas de backend-legado/src/routes/orders.routes.js
@ApiTags('orders')
@ApiCookieAuth('accessToken')
@Scopes(Scope.POS, Scope.ORDERS, Scope.ORDER_STATUS)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
  ) {}

  // Pedidos abertos agrupados por mesa (pedidos sem mesa ficam separados)
  @Get()
  async findAll(@TenantId() tenantId: number) {
    const orders = await this.orders.loadOrders({
      where: Prisma.sql`${ACTIVE_ORDERS} AND o.tenant_id = ${tenantId}`,
      items: 'list',
    });

    const groups: {
      table_id: unknown;
      table_title: unknown;
      floor: unknown;
      orders: LoadedOrder[];
      order_ids: number[];
    }[] = [];
    for (const order of orders) {
      const group = order.table_id
        ? groups.find((g) => g.table_id == order.table_id)
        : undefined;
      if (group) {
        group.orders.push(order);
        group.order_ids.push(order.id);
      } else {
        groups.push({
          table_id: order.table_id,
          table_title: order.table_title,
          floor: order.floor,
          orders: [order],
          order_ids: [order.id],
        });
      }
    }
    return groups;
  }

  @Get('init')
  async init(@TenantId() tenantId: number) {
    const [paymentTypes, printSettings, storeSettings] = await Promise.all([
      this.settings.getPaymentTypes(tenantId, true),
      this.settings.getPrintRow(tenantId),
      this.settings.getStoreRow(tenantId),
    ]);
    return { paymentTypes, printSettings, storeSettings };
  }

  @Post('update-status/:id')
  @HttpCode(200)
  @ZodBody(itemStatusSchema)
  async updateItemStatus(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ItemStatusDto,
  ) {
    await this.orders.updateItemStatus(tenantId, id, dto.status);
    return { success: true, message: 'Order Item Status updated' };
  }

  @Post('cancel')
  @HttpCode(200)
  @ZodBody(orderIdsSchema)
  async cancel(@TenantId() tenantId: number, @Body() dto: OrderIdsDto) {
    await this.orders.setOrdersStatus(tenantId, dto.orderIds, 'cancelled');
    return { success: true, message: 'Order Cancelled Successfully!' };
  }

  @Post('complete')
  @HttpCode(200)
  @ZodBody(orderIdsSchema)
  async complete(@TenantId() tenantId: number, @Body() dto: OrderIdsDto) {
    await this.orders.setOrdersStatus(tenantId, dto.orderIds, 'completed');
    return { success: true, message: 'Order Completed Successfully!' };
  }

  @Post('complete-order-payment-summary')
  @HttpCode(200)
  @ZodBody(orderIdsSchema)
  paymentSummary(@TenantId() tenantId: number, @Body() dto: OrderIdsDto) {
    return this.orders.paymentSummary(
      Prisma.sql`${ACTIVE_ORDERS} AND o.id IN (${Prisma.join(dto.orderIds)}) AND o.tenant_id = ${tenantId}`,
    );
  }

  @Post('complete-and-pay-order')
  @HttpCode(200)
  @ZodBody(payOrdersSchema)
  async completeAndPay(
    @TenantId() tenantId: number,
    @Body() dto: PayOrdersDto,
  ) {
    const invoiceId = await this.orders.createInvoice(
      tenantId,
      dto.subTotal,
      dto.taxTotal,
      dto.total,
      dto.paymentTypeId,
    );
    await this.orders.completeAndPay(tenantId, dto.orderIds, invoiceId);
    return { success: true, message: 'Order Completed Successfully!' };
  }
}
