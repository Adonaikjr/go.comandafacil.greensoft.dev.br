import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptSecret, encryptSecret } from '../../common/utils/secret-box.js';
import { OAuthHttpClient } from './oauth-client.js';
import type {
  DeliveryCredentials,
  DeliveryProvider,
  ImportedOrder,
} from './delivery-provider.js';

interface KeetaOrder {
  id?: string;
  orderId?: string;
  status?: string;
  orderStatus?: string;
  total?: number;
  totalPrice?: number;
  customerName?: string;
  customer?: { name?: string };
}

// API da Keeta. ATENÇÃO: os endpoints abaixo são os mesmos placeholders do
// legado (marcados com TODO lá) e precisam ser conferidos na documentação
// oficial da Keeta antes de ir para produção. KEETA_API_BASE pode ser trocado
// pelo env.
@Injectable()
export class KeetaProvider extends OAuthHttpClient implements DeliveryProvider {
  readonly name = 'keeta' as const;
  readonly storeIdField = 'restaurant_id' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  protected get baseUrl() {
    return this.config.get('KEETA_API_BASE', { infer: true });
  }

  private get secret() {
    return this.config.get('ENCRYPTION_KEY', { infer: true }) ?? '';
  }

  protected async requestToken(clientId: string, clientSecret: string) {
    const res = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`Keeta Auth error: ${await res.text()}`);
    const data = (await res.json()) as Record<string, unknown>;
    return {
      token: String(data.access_token ?? data.accessToken),
      expiresIn: Number(data.expires_in ?? data.expiresIn ?? 3600),
    };
  }

  protected credentials(tenantId: number) {
    return this.findCredentials(tenantId);
  }

  async findCredentials(tenantId: number) {
    const row = await this.prisma.keeta_credentials.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!row) return null;
    return {
      clientId: row.client_id,
      clientSecret: decryptSecret(row.client_secret, this.secret),
      storeId: row.restaurant_id,
      isActive: row.is_active,
    };
  }

  async saveCredentials(tenantId: number, creds: DeliveryCredentials) {
    const data = {
      client_id: creds.clientId,
      client_secret: encryptSecret(creds.clientSecret, this.secret),
      restaurant_id: creds.storeId,
      is_active: true,
    };
    await this.prisma.keeta_credentials.upsert({
      where: { tenant_id: tenantId },
      create: { tenant_id: tenantId, ...data },
      update: data,
    });
    this.forgetToken(tenantId);
  }

  async tenantsWithActiveCredentials() {
    const rows = await this.prisma.keeta_credentials.findMany({
      where: { is_active: true },
      select: { tenant_id: true },
    });
    return rows.map((r) => r.tenant_id);
  }

  async fetchNewOrders(tenantId: number): Promise<ImportedOrder[]> {
    const creds = await this.findCredentials(tenantId);
    if (!creds?.storeId) return [];
    const data = await this.call<KeetaOrder[] | { orders?: KeetaOrder[] }>(
      tenantId,
      `/merchant/v1/orders?status=PENDING&restaurant_id=${encodeURIComponent(creds.storeId)}`,
    );
    const orders = Array.isArray(data) ? data : (data?.orders ?? []);
    return orders.map((order) => ({
      externalId: String(order.id ?? order.orderId),
      customerName:
        order.customer?.name || order.customerName || 'Cliente Keeta',
      total: order.total ?? order.totalPrice ?? 0,
      status: order.status || order.orderStatus || 'PLACED',
      raw: order,
    }));
  }

  // A Keeta (pelo que o legado implementou) não tem fila de eventos para confirmar
  async acknowledge() {}

  getOrderDetail(tenantId: number, externalId: string) {
    return this.call(tenantId, `/merchant/v1/orders/${externalId}`);
  }

  async confirm(tenantId: number, externalId: string) {
    await this.call(tenantId, `/merchant/v1/orders/${externalId}/confirm`, {
      method: 'POST',
    });
  }

  async startPreparation(tenantId: number, externalId: string) {
    await this.call(
      tenantId,
      `/merchant/v1/orders/${externalId}/start-preparation`,
      { method: 'POST' },
    );
  }

  async readyToPickup(tenantId: number, externalId: string) {
    await this.call(tenantId, `/merchant/v1/orders/${externalId}/ready`, {
      method: 'POST',
    });
  }

  async cancel(tenantId: number, externalId: string, reason?: string) {
    await this.call(tenantId, `/merchant/v1/orders/${externalId}/cancel`, {
      method: 'POST',
      json: { reason: reason || 'UNABLE_TO_DELIVER' },
    });
  }

  async saveLocal(tenantId: number, order: ImportedOrder) {
    const row = await this.prisma.keeta_orders.upsert({
      where: {
        keeta_order_id_tenant_id: {
          keeta_order_id: order.externalId,
          tenant_id: tenantId,
        },
      },
      create: {
        keeta_order_id: order.externalId,
        tenant_id: tenantId,
        customer_name: order.customerName,
        total: order.total,
        status: order.status,
        raw_data: JSON.stringify(order.raw),
      },
      update: { status: order.status, raw_data: JSON.stringify(order.raw) },
      select: { id: true },
    });
    return row.id;
  }

  async listOpenLocal(tenantId: number) {
    const rows = await this.prisma.keeta_orders.findMany({
      where: {
        tenant_id: tenantId,
        status: { notIn: ['CONCLUDED', 'CANCELLED'] },
      },
      select: {
        id: true,
        keeta_order_id: true,
        customer_name: true,
        total: true,
        status: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => ({ ...r, externalId: r.keeta_order_id }));
  }

  async updateLocalStatus(
    tenantId: number,
    externalId: string,
    status: string,
  ) {
    await this.prisma.keeta_orders.updateMany({
      where: { keeta_order_id: externalId, tenant_id: tenantId },
      data: { status },
    });
  }
}
