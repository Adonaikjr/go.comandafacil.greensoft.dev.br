import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Server } from 'socket.io';
import type { Env } from '../../config/env.schema.js';

export type RealtimeEvent = 'new_order' | 'new_qrorder' | 'order_update';

// Ponto único para os services avisarem POS/cozinha. Enquanto
// REALTIME_SERVER_EVENTS=false quem dispara é o frontend (eventos *_backend),
// e estes métodos não fazem nada para não duplicar o aviso.
@Injectable()
export class RealtimeService {
  private server?: Server;

  constructor(private readonly config: ConfigService<Env, true>) {}

  get serverEventsEnabled() {
    return this.config.get('REALTIME_SERVER_EVENTS', { infer: true });
  }

  attach(server: Server) {
    this.server = server;
  }

  emitToTenant(
    tenantId: number | string,
    event: RealtimeEvent,
    payload: unknown = {},
  ) {
    if (!this.serverEventsEnabled) return;
    this.server?.to(String(tenantId)).emit(event, payload);
  }
}
