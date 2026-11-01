import { Prisma } from '../../generated/prisma/client.js';
import { z } from 'zod';

export const dateFilterTypes = [
  'custom',
  'today',
  'this_month',
  'last_month',
  'last_7days',
  'yesterday',
  'tomorrow',
] as const;

export type DateFilterType = (typeof dateFilterTypes)[number];

// Mesmos filtros de período do legado (reservas, faturas e relatórios).
// CURDATE()/NOW() seguem o fuso da sessão (São Paulo, ver PrismaService).
// `lastMonth: 'calendar'` é a variante dos relatórios (mês anterior fechado);
// as outras telas usam os últimos 30 dias ('rolling').
export function dateFilterSql(
  column: Prisma.Sql,
  type: string | undefined,
  from?: string | null,
  to?: string | null,
  options: { lastMonth?: 'rolling' | 'calendar' } = {},
): Prisma.Sql {
  switch (type) {
    case 'custom':
      return Prisma.sql`DATE(${column}) >= ${from} AND DATE(${column}) <= ${to}`;
    case 'today':
      return Prisma.sql`DATE(${column}) = CURDATE()`;
    case 'this_month':
      return Prisma.sql`YEAR(${column}) = YEAR(NOW()) AND MONTH(${column}) = MONTH(NOW())`;
    case 'last_month':
      return options.lastMonth === 'calendar'
        ? Prisma.sql`MONTH(${column}) = MONTH(DATE_ADD(NOW(), INTERVAL -1 MONTH)) AND YEAR(${column}) = YEAR(DATE_ADD(NOW(), INTERVAL -1 MONTH))`
        : Prisma.sql`DATE(${column}) >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) AND DATE(${column}) <= CURDATE()`;
    case 'last_7days':
      return Prisma.sql`DATE(${column}) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND DATE(${column}) <= CURDATE()`;
    case 'yesterday':
      return Prisma.sql`DATE(${column}) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
    case 'tomorrow':
      return Prisma.sql`DATE(${column}) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)`;
    default:
      return Prisma.sql`1 = 1`;
  }
}

// Query string `?type=&from=&to=` usada nas listagens por período
export const dateFilterQuerySchema = z
  .object({
    type: z
      .string({ error: 'Please provide required details!' })
      .min(1, 'Please provide required details!'),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine((q) => q.type !== 'custom' || (q.from && q.to), {
    message: 'Please provide required details from & to dates!',
  });
export type DateFilterQuery = z.infer<typeof dateFilterQuerySchema>;
