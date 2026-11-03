import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  TenantId,
} from '../../common/decorators/current-user.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodQuery } from '../../common/decorators/zod.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import {
  dateFilterQuerySchema,
  type DateFilterQuery,
} from '../../common/utils/date-filter.js';
import { assertPeriodAllowed } from '../../common/utils/plan.js';
import { SettingsService } from '../settings/settings.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@ApiCookieAuth('accessToken')
@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly settings: SettingsService,
    private readonly reservations: ReservationsService,
  ) {}

  // backend-legado/src/routes/dashboard.routes.js
  @Get('dashboard')
  @Scopes(Scope.DASHBOARD)
  async dashboard(@TenantId() tenantId: number) {
    const today = { type: 'today' };
    const [
      reservations,
      topSellingItems,
      ordersCount,
      newCustomerCount,
      repeatedCustomerCount,
      currency,
    ] = await Promise.all([
      this.reservations.list(tenantId, 'today'),
      this.reports.topSellingItems(tenantId, today, 50),
      this.reports.ordersCount(tenantId, today),
      this.reports.newCustomersCount(tenantId, today),
      this.reports.repeatCustomersCount(tenantId, today),
      this.settings.getCurrency(tenantId),
    ]);
    return {
      reservations,
      topSellingItems,
      ordersCount,
      newCustomerCount,
      repeatedCustomerCount,
      currency,
    };
  }

  // backend-legado/src/routes/reports.routes.js
  @Get('reports')
  @Scopes(Scope.REPORTS)
  @ZodQuery(dateFilterQuerySchema)
  async reportsData(
    @CurrentUser() user: JwtPayload,
    @Query() period: DateFilterQuery,
  ) {
    assertPeriodAllowed(user, period.type);
    const tenantId = user.tenant_id;
    const [
      ordersCount,
      newCustomers,
      repeatedCustomers,
      averageOrderValue,
      totalCustomers,
      netRevenue,
      taxTotal,
      revenueTotal,
      topSellingItems,
      currency,
      revenueSeries,
      paymentBreakdown,
    ] = await Promise.all([
      this.reports.ordersCount(tenantId, period),
      this.reports.newCustomersCount(tenantId, period),
      this.reports.repeatCustomersCount(tenantId, period),
      this.reports.averageOrderValue(tenantId, period),
      this.reports.totalCustomers(tenantId),
      this.reports.netRevenue(tenantId, period),
      this.reports.taxTotal(tenantId, period),
      this.reports.revenueTotal(tenantId, period),
      this.reports.topSellingItems(tenantId, period),
      this.settings.getCurrency(tenantId),
      this.reports.revenueSeries(tenantId, period),
      this.reports.paymentBreakdown(tenantId, period),
    ]);
    return {
      ordersCount,
      newCustomers,
      repeatedCustomers,
      currency,
      averageOrderValue,
      totalCustomers,
      netRevenue,
      taxTotal,
      revenueTotal,
      topSellingItems,
      revenueSeries,
      paymentBreakdown,
    };
  }
}
