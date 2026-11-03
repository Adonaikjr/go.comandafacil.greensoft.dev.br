import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import {
  CurrentUser,
  TenantId,
} from '../../common/decorators/current-user.decorator.js';
import { RequiresPro } from '../../common/decorators/requires-pro.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody, ZodQuery } from '../../common/decorators/zod.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import {
  dateFilterQuerySchema,
  type DateFilterQuery,
} from '../../common/utils/date-filter.js';
import { assertPeriodAllowed } from '../../common/utils/plan.js';
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

  // A busca percorre o histórico inteiro
  @Get('search')
  @RequiresPro()
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
    @CurrentUser() user: JwtPayload,
    @Query() { type, from, to }: DateFilterQuery,
  ) {
    assertPeriodAllowed(user, type);
    return this.invoices.list(user.tenant_id, type, from, to);
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
