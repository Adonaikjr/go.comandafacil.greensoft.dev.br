import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import type { Env } from '../../config/env.schema.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { dateFilterSql } from '../../common/utils/date-filter.js';
import { Role } from '../../common/enums/role.enum.js';
import { nowAsDbDateTime } from '../../common/utils/db-time.js';
import { BillingService } from '../billing/billing.service.js';

type Period = { type?: string; from?: string | null; to?: string | null };

@Injectable()
export class SuperadminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly billing: BillingService,
  ) {}

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

  // ---- Autenticação ----

  async validateCredentials(email: string, password: string) {
    const admin = await this.prisma.superadmins.findUnique({
      where: { email },
    });
    if (!admin) return null;
    return (await bcrypt.compare(password, admin.password)) ? admin : null;
  }

  findAdmin(email: string) {
    return this.prisma.superadmins.findUnique({
      where: { email },
      select: { email: true, name: true },
    });
  }

  // ---- Indicadores ----

  activeTenants() {
    return this.prisma.tenants.count({ where: { is_active: 1 } });
  }

  // Base do MRR/ARR: só quem tem assinatura no Stripe. Lojas ativadas à mão
  // pelo painel não pagam e não entram na receita.
  payingTenants() {
    return this.prisma.tenants.count({
      where: { is_active: 1, subscription_id: { not: null } },
    });
  }

  inactiveTenants() {
    return this.prisma.tenants.count({ where: { is_active: 0 } });
  }

  allTenants() {
    return this.prisma.tenants.count();
  }

  totalCustomers() {
    return this.prisma.customers.count();
  }

  async ordersProcessed(period: Period) {
    const [row] = await this.prisma.$queryRaw<{ orders: bigint }[]>`
      SELECT COUNT(*) AS orders FROM orders WHERE ${this.filter('date', period)}`;
    return Number(row?.orders ?? 0);
  }

  // Volume em reais. O legado convertia para USD por exchange_rates, mas a
  // tabela está vazia e o JOIN zerava o total; todas as lojas usam BRL.
  async salesVolume(period: Period) {
    const [row] = await this.prisma.$queryRaw<{ volume: unknown }[]>`
      SELECT IFNULL(SUM(i.total), 0) AS volume
      FROM invoices i
      WHERE ${this.filter('i.created_at', period)}`;
    return Number(row?.volume ?? 0);
  }

  topSellingItems(period: Period) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT trending_items.tenant_id, t.name AS tenant_name, trending_items.item_id, mi.title, qty
      FROM (
        SELECT tenant_id, item_id, CAST(SUM(quantity) AS SIGNED) AS qty
        FROM order_items
        WHERE ${this.filter('date', period)}
        GROUP BY item_id, tenant_id
      ) AS trending_items
      INNER JOIN menu_items mi ON trending_items.item_id = mi.id
      INNER JOIN tenants t ON trending_items.tenant_id = t.id
      ORDER BY qty DESC
      LIMIT 50`;
  }

  // ---- Tenants ----

  async listTenants(query: {
    page?: number;
    perPage?: number;
    search?: string;
    status?: string;
    type?: string;
    from?: string;
    to?: string;
  }) {
    const currentPage = query.page || 1;
    const limit = query.perPage || 5;
    const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    if (query.status === 'active') conditions.push(Prisma.sql`t.is_active = 1`);
    if (query.status === 'inactive')
      conditions.push(Prisma.sql`t.is_active = 0`);
    if (query.search) {
      const like = `%${query.search}%`;
      conditions.push(
        Prisma.sql`(t.name LIKE ${like} OR u.username LIKE ${like})`,
      );
    }
    if (query.type) conditions.push(this.filter('t.created_at', query));

    const where = Prisma.join(conditions, ' AND ');

    const [tenants, [count]] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT t.*, u.username AS email
        FROM tenants t
        LEFT JOIN users u ON t.id = u.tenant_id AND u.role = 'admin'
        WHERE ${where}
        ORDER BY t.id DESC
        LIMIT ${limit} OFFSET ${(currentPage - 1) * limit}`,
      // Total com os mesmos filtros: a paginação da tela depende dele
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(DISTINCT t.id) AS total
        FROM tenants t
        LEFT JOIN users u ON t.id = u.tenant_id AND u.role = 'admin'
        WHERE ${where}`,
    ]);
    return {
      tenants,
      total: Number(count?.total ?? 0),
      currentPage,
      perPage: limit,
    };
  }

  tenantsByStatus(isActive: 0 | 1 | null) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT t.*, u.username AS email
      FROM tenants t
      LEFT JOIN users u ON t.id = u.tenant_id AND u.role = 'admin'
      ${isActive === null ? Prisma.empty : Prisma.sql`WHERE t.is_active = ${isActive}`}`;
  }

  async tenantDetails(tenantId: number) {
    const [subscriptionHistory, tenantInfo, storeDetails, totalUsers] =
      await Promise.all([
        this.prisma.subscription_history.findMany({
          where: { tenant_id: tenantId },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.tenants.findUnique({
          where: { id: tenantId },
          select: {
            id: true,
            name: true,
            is_active: true,
            created_at: true,
            subscription_id: true,
            payment_customer_id: true,
            subscription_start: true,
            subscription_end: true,
          },
        }),
        this.prisma.store_details.findUnique({
          where: { tenant_id: tenantId },
          select: {
            tenant_id: true,
            store_name: true,
            address: true,
            phone: true,
            email: true,
            currency: true,
            is_qr_menu_enabled: true,
            unique_qr_code: true,
          },
        }),
        this.prisma.users.count({ where: { tenant_id: tenantId } }),
      ]);
    if (!tenantInfo) throw new NotFoundException('Tenant Not Found');
    return { tenantInfo, storeDetails, totalUsers, subscriptionHistory };
  }

  async addTenant(input: {
    name: string;
    email: string;
    password: string;
    isActive: boolean;
  }) {
    const exists = await this.prisma.users.findUnique({
      where: { username: input.email },
      select: { username: true },
    });
    if (exists)
      throw new ConflictException('User already exist! Try Different Email!');

    const password = await bcrypt.hash(
      input.password,
      this.config.get('PASSWORD_SALT', { infer: true }),
    );
    const tenant = await this.prisma.tenants.create({
      data: {
        name: input.name,
        is_active: input.isActive ? 1 : 0,
        // Mesmo período de teste do cadastro pelo site
        trial_started_at: nowAsDbDateTime(),
        users: {
          create: {
            username: input.email,
            password,
            name: input.name,
            role: Role.ADMIN,
          },
        },
      },
    });
    return {
      tenantId: tenant.id,
      name: input.name,
      isActive: input.isActive,
      role: Role.ADMIN,
    };
  }

  private async findTenantAdmin(tenantId: number) {
    const tenant = await this.prisma.tenants.findUnique({
      where: { id: tenantId },
      select: {
        is_active: true,
        users: {
          where: { role: Role.ADMIN },
          select: { username: true },
          take: 1,
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant Not Found');
    return { isActive: tenant.is_active, username: tenant.users[0]?.username };
  }

  // Atualiza nome/status do tenant e nome/e-mail do admin. Se o e-mail mudar
  // ou o tenant for desativado, derruba as sessões dos usuários do tenant.
  async updateTenant(
    tenantId: number,
    input: { name: string; email: string; isActive: number },
  ) {
    const current = await this.findTenantAdmin(tenantId);

    if (current.username !== input.email) {
      const emailInUse = await this.prisma.users.findUnique({
        where: { username: input.email },
        select: { username: true },
      });
      if (emailInUse)
        throw new BadRequestException(
          'Account already exists with provided email !',
        );
    }

    await this.prisma.$transaction([
      this.prisma.tenants.update({
        where: { id: tenantId },
        data: { name: input.name, is_active: input.isActive },
      }),
      ...(current.username
        ? [
            this.prisma.users.update({
              where: { username: current.username },
              data: { name: input.name, username: input.email },
            }),
          ]
        : []),
    ]);

    if (
      current.username !== input.email ||
      (input.isActive == 0 && current.isActive == 1)
    ) {
      await this.prisma.refresh_tokens.deleteMany({
        where: { tenant_id: tenantId },
      });
    }
  }

  async deleteTenant(tenantId: number) {
    await this.findTenantAdmin(tenantId);
    // A cobrança tem que parar antes de a loja sumir (igual à exclusão de conta)
    const { subscription_id } = await this.prisma.tenants.findUniqueOrThrow({
      where: { id: tenantId },
      select: { subscription_id: true },
    });
    if (subscription_id)
      await this.billing.cancelSubscriptionIfActive(subscription_id);

    await this.prisma.$transaction([
      this.prisma.qr_order_items.deleteMany({ where: { tenant_id: tenantId } }),
      this.prisma.qr_orders.deleteMany({ where: { tenant_id: tenantId } }),
      // Tabelas do iFood sem FK para tenants (não caem no CASCADE)
      this.prisma.ifood_auth_tokens.deleteMany({
        where: { tenant_id: tenantId },
      }),
      this.prisma.ifood_catalog_mapping.deleteMany({
        where: { tenant_id: tenantId },
      }),
      this.prisma.tenants.delete({ where: { id: tenantId } }),
    ]);
  }

  // ---- Visitantes da página de vendas ----

  async logVisitor(data: Prisma.page_visitorsCreateInput) {
    await this.prisma.page_visitors.create({ data });
  }

  async visitors(query: {
    page: number;
    perPage: number;
    search: string;
    filterPage: string;
  }) {
    const where: Prisma.page_visitorsWhereInput = {};
    if (query.filterPage) where.page = query.filterPage;
    if (query.search) {
      where.OR = [
        { ip_address: { contains: query.search } },
        { referrer: { contains: query.search } },
        { user_agent: { contains: query.search } },
      ];
    }

    const [visitors, total, [stats]] = await Promise.all([
      this.prisma.page_visitors.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: query.perPage,
        skip: (query.page - 1) * query.perPage,
      }),
      this.prisma.page_visitors.count({ where }),
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT COUNT(*) AS total,
               CAST(SUM(DATE(created_at) = CURDATE()) AS SIGNED) AS today,
               CAST(SUM(DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS SIGNED) AS last_7days,
               COUNT(DISTINCT ip_address) AS unique_ips
        FROM page_visitors`,
    ]);
    return { visitors, total, stats };
  }
}
