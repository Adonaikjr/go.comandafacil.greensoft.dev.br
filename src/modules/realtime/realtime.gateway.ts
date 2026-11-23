import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { Env } from '../../config/env.schema.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { TokenService } from '../auth/token.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { RealtimeService } from './realtime.service.js';

type AppSocket = Socket & { data: { user?: JwtPayload } };

// Substitui o Socket.IO de backend-legado/index.js. Cada restaurante tem uma
// sala (tenant_id). O cliente é identificado pelo JWT (cookie accessToken,
// auth.token ou header Authorization) e entra na sala automaticamente.
@WebSocketGateway({ cors: { credentials: true, origin: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
  }

  handleConnection(socket: AppSocket) {
    const user = this.authenticate(socket);
    if (user) {
      socket.data.user = user;
      void socket.join(String(user.tenant_id));
    }
  }

  @SubscribeMessage('authenticate')
  onAuthenticate(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() tenantId: unknown,
  ) {
    const user = socket.data.user;
    if (user) {
      // Já está na sala do próprio tenant; ignora outro tenant informado
      if (String(tenantId) !== String(user.tenant_id)) {
        this.logger.warn(
          `Socket ${socket.id} pediu tenant ${String(tenantId)} diferente do token`,
        );
      }
      return;
    }
    if (this.config.get('SOCKET_LEGACY_AUTH', { infer: true }) && tenantId) {
      void socket.join(String(tenantId));
    }
  }

  // ---- Eventos repassados pelo frontend (compatibilidade com o legado) ----

  @SubscribeMessage('new_order_backend')
  onNewOrder(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() args: unknown,
  ) {
    this.relay(socket, 'new_order', args);
  }

  @SubscribeMessage('order_update_backend')
  onOrderUpdate(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() args: unknown,
  ) {
    this.relay(socket, 'order_update', args);
  }

  @SubscribeMessage('new_qrorder_backend')
  async onNewQrOrder(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() args: unknown,
  ) {
    if (this.realtime.serverEventsEnabled) return;
    const [payload, qrcode] = asArgs(args);
    const tenantId = await this.settings.getTenantIdFromQRCode(String(qrcode));
    if (tenantId) socket.to(String(tenantId)).emit('new_qrorder', payload);
  }

  private relay(socket: AppSocket, event: string, args: unknown) {
    if (this.realtime.serverEventsEnabled) return;
    const [payload, tenantId] = asArgs(args);
    const user = socket.data.user;
    // Sem token, só o modo legado aceita o tenant informado pelo cliente
    if (!user && !this.config.get('SOCKET_LEGACY_AUTH', { infer: true })) {
      return;
    }
    const room = user ? String(user.tenant_id) : String(tenantId ?? '');
    if (room) socket.to(room).emit(event, payload);
  }

  private authenticate(socket: Socket): JwtPayload | null {
    const { auth, headers } = socket.handshake;
    const cookies = parseCookies(headers.cookie);
    const bearer = headers.authorization?.startsWith('Bearer ')
      ? headers.authorization.slice(7)
      : undefined;
    const token =
      (auth?.token as string | undefined) ?? cookies.accessToken ?? bearer;
    if (!token) return null;
    try {
      return this.tokens.verify(token);
    } catch {
      return null;
    }
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  return Object.fromEntries(
    (header ?? '')
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]),
  );
}

// Com vários argumentos (payload, tenantId) o Nest entrega um array em @MessageBody
function asArgs(args: unknown): unknown[] {
  return Array.isArray(args) ? args : [args];
}
