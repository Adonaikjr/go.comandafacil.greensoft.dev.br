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

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

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
      const tokens = await this.tokensForQr(tenantId);
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

  private async tokensForQr(tenantId: number) {
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
          (r.scope ?? '').split(',').some((s) => QR_SCOPES.includes(s.trim())),
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
