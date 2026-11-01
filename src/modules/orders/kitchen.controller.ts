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
import { ACTIVE_ORDERS, OrdersService } from './orders.service.js';
import { itemStatusSchema, type ItemStatusDto } from './dto/order.schema.js';

// Rotas de backend-legado/src/routes/kitchen.routes.js
@ApiTags('kitchen')
@ApiCookieAuth('accessToken')
@Scopes(Scope.KITCHEN, Scope.KITCHEN_DISPLAY)
@Controller('kitchen')
export class KitchenController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  findAll(@TenantId() tenantId: number) {
    return this.orders.loadOrders({
      where: Prisma.sql`${ACTIVE_ORDERS} AND o.tenant_id = ${tenantId}`,
      items: 'kitchen',
    });
  }

  // No legado esta rota não filtrava por tenant
  @Post(':id')
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
}
