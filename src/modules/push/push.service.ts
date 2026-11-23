import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Scope } from '../../common/enums/scope.enum.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Limite do Expo por requisição.
const CHUNK = 100;

// Quem consegue aceitar um pedido do QR no app: as mesmas permissões que
// mostram a fila do QR (o trilho do Salão e da Comanda).
const QR_SCOPES = [Scope.POS, Scope.ORDERS, Scope.ORDER_STATUS] as string[];
// Quem ve a fila da cozinha no app (aba Cozinha).
const KITCHEN_SCOPES = [Scope.KITCHEN, Scope.KITCHEN_DISPLAY] as string[];
// Quem ve o Salao no app: os mesmos escopos da aba.
const FLOOR_SCOPES = QR_SCOPES;

// Arrastar o pedido na cozinha manda um POST por item. Espera os itens do
// mesmo pedido chegarem para mandar um aviso so, com o total de prontos.
const READY_DEBOUNCE_MS = 1500;

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  // Pedidos com item recem-pronto esperando o aviso juntar (por pedido).
  private readonly pendingReady = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // O mesmo aparelho pode trocar de conta: a linha passa para quem logou agora.
  async register(
    tenantId: number,
    username: string,
    token: string,
    platform?: string | null,
  ) {
    await this.prisma.push_tokens.upsert({
      where: { token },
      create: { tenant_id: tenantId, username, token, platform },
      update: { tenant_id: tenantId, username, platform },
    });
  }

  async unregister(username: string, token: string) {
    await this.prisma.push_tokens.deleteMany({ where: { username, token } });
  }

  // Chamado depois que o pedido do QR já foi gravado. Nunca lança: falha no
  // push não pode derrubar o pedido do cliente.
  async notifyQrOrder(tenantId: number, tableId: number | null) {
    try {
      const tokens = await this.tokensFor(tenantId, QR_SCOPES);
      if (tokens.length === 0) return;

      const table = tableId
        ? await this.prisma.store_tables.findFirst({
            where: { id: tableId, tenant_id: tenantId },
            select: { table_title: true },
          })
        : null;
      const where = table?.table_title
        ? `Mesa ${table.table_title}`
        : 'Um cliente';

      await this.send(
        tokens.map((to) => ({
          to,
          title: 'Pedido pelo QR',
          body: `${where} pediu pelo cardápio. Toque para aceitar.`,
          sound: 'default',
          channelId: 'qr-orders',
          priority: 'high',
          data: { url: '/qrorders' },
        })),
      );
    } catch (error) {
      this.logger.warn(`Push do pedido QR falhou: ${String(error)}`);
    }
  }

  // Pedido novo lancado no PDV/app: avisa a cozinha. Nunca lanca. O aparelho
  // que lancou descarta o proprio aviso pelo orderId (ver push.ts do app):
  // excluir pelo usuario calaria a cozinha que usa o mesmo login do salao.
  async notifyKitchenNewOrder(
    tenantId: number,
    order: { orderId: number; tokenNo: number },
  ) {
    try {
      const tokens = await this.tokensFor(tenantId, KITCHEN_SCOPES);
      if (tokens.length === 0) return;

      const row = await this.prisma.orders.findFirst({
        where: { id: order.orderId, tenant_id: tenantId },
        select: { table_id: true },
      });
      const message = kitchenMessage(
        order.tokenNo,
        await this.tableTitle(tenantId, row?.table_id ?? null),
      );

      await this.send(
        tokens.map((to) => ({
          to,
          ...message,
          sound: 'default',
          channelId: 'kitchen-orders',
          priority: 'high',
          data: { url: '/cozinha', type: 'kitchen', orderId: order.orderId },
        })),
      );
    } catch (error) {
      this.logger.warn(`Push de pedido novo falhou: ${String(error)}`);
    }
  }

  // Item marcado como pronto: junta os itens do mesmo pedido e avisa o salao
  // uma vez. Nunca lanca.
  async notifyItemReady(tenantId: number, itemId: number) {
    try {
      const item = await this.prisma.order_items.findFirst({
        where: { id: itemId, tenant_id: tenantId },
        select: { order_id: true },
      });
      if (!item?.order_id) return;

      const orderId = item.order_id;
      const key = `${tenantId}:${orderId}`;
      clearTimeout(this.pendingReady.get(key));

      const timer = setTimeout(() => {
        this.pendingReady.delete(key);
        void this.sendReady(tenantId, orderId);
      }, READY_DEBOUNCE_MS);
      timer.unref?.();
      this.pendingReady.set(key, timer);
    } catch (error) {
      this.logger.warn(`Push de pedido pronto falhou: ${String(error)}`);
    }
  }

  private async sendReady(tenantId: number, orderId: number) {
    try {
      const order = await this.prisma.orders.findFirst({
        where: { id: orderId, tenant_id: tenantId },
        select: { token_no: true, table_id: true },
      });
      if (!order) return;
      const ready = await this.prisma.order_items.count({
        where: { order_id: orderId, tenant_id: tenantId, status: 'completed' },
      });
      // Voltou para preparo antes do aviso sair: nada pronto, nada a avisar.
      if (ready === 0) return;

      const tokens = await this.tokensFor(tenantId, FLOOR_SCOPES);
      if (tokens.length === 0) return;

      const message = readyMessage(
        order.token_no,
        await this.tableTitle(tenantId, order.table_id),
        ready,
      );
      await this.send(
        tokens.map((to) => ({
          to,
          ...message,
          sound: 'default',
          channelId: 'ready-orders',
          priority: 'high',
          data: { url: '/salao', type: 'ready', orderId },
        })),
      );
    } catch (error) {
      this.logger.warn(`Push de pedido pronto falhou: ${String(error)}`);
    }
  }

  private async tableTitle(tenantId: number, tableId: number | null) {
    if (!tableId) return null;
    const table = await this.prisma.store_tables.findFirst({
      where: { id: tableId, tenant_id: tenantId },
      select: { table_title: true },
    });
    return table?.table_title ?? null;
  }

  // Aparelhos de quem tem algum dos escopos, ou e admin.
  private async tokensFor(tenantId: number, scopes: string[]) {
    const rows = await this.prisma.$queryRaw<
      { token: string; role: string | null; scope: string | null }[]
    >`
      SELECT p.token, u.role, u.scope
      FROM push_tokens p
      INNER JOIN users u ON u.username = p.username AND u.tenant_id = p.tenant_id
      WHERE p.tenant_id = ${tenantId}`;
    return rows
      .filter(
        (r) =>
          r.role === 'admin' ||
          (r.scope ?? '').split(',').some((s) => scopes.includes(s.trim())),
      )
      .map((r) => r.token);
  }

  private async send(messages: Record<string, unknown>[]) {
    const accessToken = this.config.get('EXPO_ACCESS_TOKEN', { infer: true });
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        this.logger.warn(`Expo push respondeu ${res.status}`);
        continue;
      }
      const { data } = (await res.json()) as { data?: ExpoTicket[] };
      // App desinstalado ou token revogado: o Expo avisa e o token sai daqui.
      const dead = (data ?? [])
        .map((ticket, index) =>
          ticket.details?.error === 'DeviceNotRegistered'
            ? (chunk[index].to as string)
            : null,
        )
        .filter((t): t is string => t != null);
      if (dead.length) {
        await this.prisma.push_tokens.deleteMany({
          where: { token: { in: dead } },
        });
      }
    }
  }
}

/** Texto do aviso de pedido novo na cozinha. */
export function kitchenMessage(tokenNo: number | null, table: string | null) {
  const where = table ? `Mesa ${table}` : 'Balcão';
  return {
    title: 'Pedido novo na cozinha',
    body: tokenNo != null ? `Senha ${tokenNo} · ${where}` : where,
  };
}

/** Texto do aviso de pedido pronto no salao. */
export function readyMessage(
  tokenNo: number | null,
  table: string | null,
  readyCount: number,
) {
  const where = table ? `Mesa ${table}` : 'Balcão';
  const items = `${readyCount} ${readyCount === 1 ? 'item pronto' : 'itens prontos'}`;
  return {
    title: 'Pedido pronto para servir',
    body: `${where} · ${items}${tokenNo != null ? ` · Senha ${tokenNo}` : ''}`,
  };
}
