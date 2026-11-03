import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { dateFilterSql } from '../../common/utils/date-filter.js';

type Period = { type?: string; from?: string | null; to?: string | null };

// Consultas do dashboard (dia de hoje) e dos relatórios (período escolhido).
// "last_month" nos relatórios é o mês anterior fechado, como no legado.
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private filter(column: string, period: Period) {
    return dateFilterSql(
      Prisma.raw(column),
      period.type,
      period.from,
      period.to,
      {
        lastMonth: 'calendar',
      },
    );
  }

  private async scalar<T = unknown>(query: Prisma.Sql): Promise<T> {
    const rows = await this.prisma.$queryRaw<Record<string, T>[]>(query);
    return Object.values(rows[0] ?? {})[0] as T;
  }

  ordersCount(tenantId: number, period: Period) {
    return this.scalar(Prisma.sql`
      SELECT COUNT(*) AS todays_orders FROM orders
      WHERE tenant_id = ${tenantId} AND ${this.filter('date', period)}`);
  }

  newCustomersCount(tenantId: number, period: Period) {
    return this.scalar(Prisma.sql`
      SELECT COUNT(*) AS new_customers_count FROM customers
      WHERE tenant_id = ${tenantId} AND ${this.filter('created_at', period)}`);
  }

  repeatCustomersCount(tenantId: number, period: Period) {
    return this.scalar(Prisma.sql`
      SELECT COUNT(*) AS todays_repeat_customers FROM orders
      WHERE tenant_id = ${tenantId} AND ${this.filter('date', period)}
        AND customer_type = 'CUSTOMER'`);
  }

  totalCustomers(tenantId: number) {
    return this.prisma.customers.count({ where: { tenant_id: tenantId } });
  }

  private invoicesAggregate(
    expression: string,
    tenantId: number,
    period: Period,
  ) {
    return this.scalar(Prisma.sql`
      SELECT ${Prisma.raw(expression)} FROM invoices
      WHERE tenant_id = ${tenantId} AND ${this.filter('created_at', period)}`);
  }

  averageOrderValue(tenantId: number, period: Period) {
    return this.invoicesAggregate('AVG(total)', tenantId, period);
  }

  revenueTotal(tenantId: number, period: Period) {
    return this.invoicesAggregate('SUM(total)', tenantId, period);
  }

  taxTotal(tenantId: number, period: Period) {
    return this.invoicesAggregate('SUM(tax_total)', tenantId, period);
  }

  netRevenue(tenantId: number, period: Period) {
    return this.invoicesAggregate('SUM(sub_total)', tenantId, period);
  }

  // Fechamento do caixa por forma de pagamento. Faturas sem forma (antigas,
  // ou de clientes que não mandam o campo) vêm agrupadas com título nulo.
  async paymentBreakdown(tenantId: number, period: Period) {
    const rows = await this.prisma.$queryRaw<
      { title: string | null; invoices: bigint; total: unknown }[]
    >`
      SELECT payment_type_title AS title, COUNT(*) AS invoices, SUM(total) AS total
      FROM invoices
      WHERE tenant_id = ${tenantId} AND ${this.filter('created_at', period)}
      GROUP BY payment_type_title
      ORDER BY SUM(total) DESC`;
    return rows.map((r) => ({
      title: r.title,
      invoices: Number(r.invoices),
      total: r.total,
    }));
  }

  // Receita e número de faturas por hora (período de um dia) ou por dia
  async revenueSeries(tenantId: number, period: Period) {
    const granularity = seriesGranularity(period);
    const bucket =
      granularity === 'hour'
        ? Prisma.sql`HOUR(created_at)`
        : Prisma.sql`DATE_FORMAT(created_at, '%Y-%m-%d')`;
    const rows = await this.prisma.$queryRaw<
      { bucket: unknown; revenue: unknown; invoices: unknown }[]
    >`
      SELECT ${bucket} AS bucket, SUM(total) AS revenue, COUNT(*) AS invoices
      FROM invoices
      WHERE tenant_id = ${tenantId} AND ${this.filter('created_at', period)}
      GROUP BY bucket
      ORDER BY bucket`;
    return {
      granularity,
      points: rows.map((r) => ({
        bucket: String(r.bucket),
        revenue: Number(r.revenue ?? 0),
        invoices: Number(r.invoices ?? 0),
      })),
    };
  }

  // O dashboard limita o subselect a 50 itens, os relatórios não
  topSellingItems(tenantId: number, period: Period, limit?: number) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT mi.*, oi_c.orders_count
      FROM menu_items mi
      INNER JOIN (
        SELECT item_id, CAST(SUM(quantity) AS SIGNED) AS orders_count
        FROM order_items
        WHERE tenant_id = ${tenantId} AND status <> 'cancelled' AND ${this.filter('date', period)}
        GROUP BY item_id
        ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
      ) oi_c ON mi.id = oi_c.item_id
      WHERE tenant_id = ${tenantId}
      ORDER BY oi_c.orders_count DESC`;
  }
}

function seriesGranularity(period: Period): 'hour' | 'day' {
  if (['today', 'yesterday', 'tomorrow'].includes(period.type ?? '')) {
    return 'hour';
  }
  if (period.type === 'custom' && period.from && period.from === period.to) {
    return 'hour';
  }
  return 'day';
}
