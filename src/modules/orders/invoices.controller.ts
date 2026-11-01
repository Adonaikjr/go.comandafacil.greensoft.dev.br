import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { TenantId } from '../../common/decorators/current-user.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody, ZodQuery } from '../../common/decorators/zod.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import {
  dateFilterQuerySchema,
  type DateFilterQuery,
} from '../../common/utils/date-filter.js';
import { SettingsService } from '../settings/settings.service.js';
import { InvoicesService } from './invoices.service.js';
import { OrdersService } from './orders.service.js';
import { orderIdsSchema, type OrderIdsDto } from './dto/order.schema.js';

const searchSchema = z.object({
  q: z
    .string({ error: 'Please provide required details!' })
    .min(1, 'Please provide required details!'),
});

// Rotas de backend-legado/src/routes/invoice.routes.js
@ApiTags('invoices')
@ApiCookieAuth('accessToken')
@Scopes(Scope.INVOICES, Scope.POS)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
  ) {}

  @Get('search')
  @ZodQuery(searchSchema)
  search(
    @TenantId() tenantId: number,
    @Query() { q }: z.infer<typeof searchSchema>,
  ) {
    return this.invoices.search(tenantId, q);
  }

  @Get()
  @ZodQuery(dateFilterQuerySchema)
  list(
    @TenantId() tenantId: number,
    @Query() { type, from, to }: DateFilterQuery,
  ) {
    return this.invoices.list(tenantId, type, from, to);
  }

  @Get('init')
  async init(@TenantId() tenantId: number) {
    const [printSettings, storeSettings] = await Promise.all([
      this.settings.getPrintRow(tenantId),
      this.settings.getStoreRow(tenantId),
    ]);
    return { printSettings, storeSettings };
  }

  // Itens e totais dos pedidos de uma fatura (reimpressão). No legado não
  // filtrava por tenant.
  @Post('orders')
  @HttpCode(200)
  @ZodBody(orderIdsSchema)
  orderDetails(@TenantId() tenantId: number, @Body() dto: OrderIdsDto) {
    return this.orders.paymentSummary(
      Prisma.sql`o.status NOT IN ('cancelled') AND o.id IN (${Prisma.join(dto.orderIds)}) AND o.tenant_id = ${tenantId}`,
    );
  }
}
