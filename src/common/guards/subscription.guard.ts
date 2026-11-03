import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRES_PRO_KEY } from '../decorators/requires-pro.decorator.js';
import type { JwtPayload } from '../types/jwt-payload.js';
import { hasProAccess, ProRequiredException } from '../utils/plan.js';

// Freemium: sem assinatura a loja continua usando o plano grátis. Só as rotas
// marcadas com @RequiresPro() respondem 402. Limites dentro de uma rota (período
// dos relatórios, tamanho da equipe) ficam no próprio controller.
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Guards globais valem só para HTTP; o Socket.IO autentica no gateway
    if (context.getType() !== 'http') return true;

    const requiresPro = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_PRO_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiresPro) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();

    if (hasProAccess(user)) return true;
    throw new ProRequiredException();
  }
}
