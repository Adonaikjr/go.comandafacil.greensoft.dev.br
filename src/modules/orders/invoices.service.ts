import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { dateFilterSql } from '../../common/utils/date-filter.js';

export interface InvoiceRow {
  invoice_id: number;
  order_id: number;
  created_at: Date | null;
  sub_total: unknown;
  tax_total: unknown;
  total: unknown;
  payment_type_title: string | null;
  table_id: number | null;
  table_title: string | null;
  floor: string | null;
  payment_status: string | null;
  token_no: number | null;
  delivery_type: string | null;
  customer_type: string | null;
  customer_id: string | null;
  name: string | null;
  email: string | null;
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private select(where: Prisma.Sql, suffix = Prisma.empty) {
    return this.prisma.$queryRaw<InvoiceRow[]>`
      SELECT o.invoice_id, o.id AS order_id, i.created_at, i.sub_total, i.tax_total, i.total,
             i.payment_type_title, o.table_id, st.table_title, st.floor, o.payment_status, o.token_no,
             o.delivery_type, o.customer_type, o.customer_id, c.name, c.email
      FROM orders o
      INNER JOIN invoices i ON o.invoice_id = i.id AND i.tenant_id = o.tenant_id
      LEFT JOIN customers c ON o.customer_id = c.phone AND c.tenant_id = o.tenant_id
      LEFT JOIN store_tables st ON o.table_id = st.id
      WHERE ${where}
      ORDER BY i.created_at DESC
      ${suffix}`;
  }

  async list(tenantId: number, type: string, from?: string, to?: string) {
    const rows = await this.select(
      Prisma.sql`${dateFilterSql(Prisma.raw('i.created_at'), type, from, to)} AND i.tenant_id = ${tenantId}`,
    );
    return groupByInvoice(rows);
  }

  async search(tenantId: number, q: string) {
    const rows = await this.select(
      Prisma.sql`(o.invoice_id = ${q} OR o.id = ${q} OR o.customer_id LIKE ${q} OR c.name LIKE ${`%${q}%`})
        AND i.tenant_id = ${tenantId}`,
      Prisma.sql`LIMIT 20`,
    );
    return groupByInvoice(rows);
  }
}

// Uma fatura pode cobrir vários pedidos (mesa): agrupa as linhas por invoice_id
function groupByInvoice(rows: InvoiceRow[]) {
  const invoices: (Omit<
    InvoiceRow,
    'order_id' | 'payment_status' | 'token_no'
  > & {
    orders: Pick<InvoiceRow, 'order_id' | 'payment_status' | 'token_no'>[];
  })[] = [];

  for (const { order_id, payment_status, token_no, ...invoice } of rows) {
    const order = { order_id, payment_status, token_no };
    const existing = invoices.find((i) => i.invoice_id == invoice.invoice_id);
    if (existing) existing.orders.push(order);
    else invoices.push({ ...invoice, orders: [order] });
  }
  return invoices;
}
