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

interface IfoodEvent {
  id: string;
  orderId: string;
}

interface IfoodOrder {
  id: string;
  orderStatus?: string;
  totalPrice?: number;
  customer?: { name?: string };
  total?: { orderAmount?: number };
}

const EVENT_TYPES =
  'PLACED,CONFIRMED,READY_TO_PICKUP,DISPATCHED,CONCLUDED,CANCELLED';

// API Merchant do iFood (backend-legado/src/services/ifood.service.js)
@Injectable()
export class IfoodProvider extends OAuthHttpClient implements DeliveryProvider {
  readonly name = 'ifood' as const;
  readonly storeIdField = 'merchant_id' as const;
  protected readonly baseUrl = 'https://merchant-api.ifood.com.br';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  private get secret() {
    return this.config.get('ENCRYPTION_KEY', { infer: true }) ?? '';
  }

  protected async requestToken(clientId: string, clientSecret: string) {
    const res = await fetch(`${this.baseUrl}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grantType: 'client_credentials',
        clientId,
        clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`iFood Auth error: ${await res.text()}`);
    const data = (await res.json()) as {
      accessToken: string;
      expiresIn: number;
    };
    return { token: data.accessToken, expiresIn: data.expiresIn };
  }

  protected credentials(tenantId: number) {
    return this.findCredentials(tenantId);
  }

  async findCredentials(tenantId: number) {
    const row = await this.prisma.ifood_credentials.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!row) return null;
    return {
      clientId: row.client_id,
      clientSecret: decryptSecret(row.client_secret, this.secret),
      storeId: row.merchant_id,
      isActive: row.is_active,
    };
  }

  async saveCredentials(tenantId: number, creds: DeliveryCredentials) {
    const data = {
      client_id: creds.clientId,
      client_secret: encryptSecret(creds.clientSecret, this.secret),
      merchant_id: creds.storeId,
      is_active: true,
    };
    await this.prisma.ifood_credentials.upsert({
      where: { tenant_id: tenantId },
      create: { tenant_id: tenantId, ...data },
      update: data,
    });
    this.forgetToken(tenantId);
  }

  async tenantsWithActiveCredentials() {
    const rows = await this.prisma.ifood_credentials.findMany({
      where: { is_active: true },
      select: { tenant_id: true },
    });
    return rows.map((r) => r.tenant_id);
  }

  // Polling de eventos; para cada evento busca o detalhe do pedido
  async fetchNewOrders(tenantId: number): Promise<ImportedOrder[]> {
    const creds = await this.findCredentials(tenantId);
    if (!creds?.storeId) return [];

    const events =
      (await this.call<IfoodEvent[]>(
        tenantId,
        `/order/v1.0/events:polling?types=${EVENT_TYPES}`,
        {
          headers: { 'x-polling-merchants': creds.storeId },
        },
      )) ?? [];

    const orders: ImportedOrder[] = [];
    for (const event of Array.isArray(events) ? events : []) {
      const detail = (await this.getOrderDetail(
        tenantId,
        event.orderId,
      )) as IfoodOrder;
      orders.push({
        externalId: detail.id,
        customerName: detail.customer?.name || 'Cliente iFood',
        total: detail.totalPrice ?? detail.total?.orderAmount ?? 0,
        status: detail.orderStatus || 'PLACED',
        raw: detail,
        ackId: event.id,
      });
    }
    return orders;
  }

  async acknowledge(tenantId: number, ackIds: string[]) {
    if (!ackIds.length) return;
    await this.call(tenantId, '/order/v1.0/events/acknowledgment', {
      method: 'POST',
      json: ackIds.map((id) => ({ id })),
    });
  }

  getOrderDetail(tenantId: number, externalId: string) {
    return this.call(tenantId, `/order/v1.0/orders/${externalId}`);
  }

  async confirm(tenantId: number, externalId: string) {
    await this.call(tenantId, `/order/v1.0/orders/${externalId}/confirm`, {
      method: 'POST',
    });
  }

  async startPreparation(tenantId: number, externalId: string) {
    await this.call(
      tenantId,
      `/order/v1.0/orders/${externalId}/startPreparation`,
      { method: 'POST' },
    );
  }

  async readyToPickup(tenantId: number, externalId: string) {
    await this.call(
      tenantId,
      `/order/v1.0/orders/${externalId}/readyToPickup`,
      { method: 'POST' },
    );
  }

  async cancel(tenantId: number, externalId: string, reason?: string) {
    await this.call(tenantId, `/order/v1.0/orders/${externalId}/cancel`, {
      method: 'POST',
      json: { cancellationCode: reason || 'UNABLE_TO_DELIVER' },
    });
  }

  async saveLocal(tenantId: number, order: ImportedOrder) {
    const row = await this.prisma.ifood_orders.upsert({
      where: {
        ifood_order_id_tenant_id: {
          ifood_order_id: order.externalId,
          tenant_id: tenantId,
        },
      },
      create: {
        ifood_order_id: order.externalId,
        tenant_id: tenantId,
        customer_name: order.customerName,
        total: order.total,
        status: order.status,
        raw_data: JSON.stringify(order.raw),
      },
      // Eventos seguintes (CONFIRMED, CANCELLED...) atualizam o status
      update: { status: order.status, raw_data: JSON.stringify(order.raw) },
      select: { id: true },
    });
    return row.id;
  }

  async listOpenLocal(tenantId: number) {
    const rows = await this.prisma.ifood_orders.findMany({
      where: {
        tenant_id: tenantId,
        status: { notIn: ['CONCLUDED', 'CANCELLED'] },
      },
      select: {
        id: true,
        ifood_order_id: true,
        customer_name: true,
        total: true,
        status: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => ({ ...r, externalId: r.ifood_order_id }));
  }

  async updateLocalStatus(
    tenantId: number,
    externalId: string,
    status: string,
  ) {
    await this.prisma.ifood_orders.updateMany({
      where: { ifood_order_id: externalId, tenant_id: tenantId },
      data: { status },
    });
  }
}
