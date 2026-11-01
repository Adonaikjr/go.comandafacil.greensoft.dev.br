import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SKIP_SUBSCRIPTION_KEY } from '../decorators/skip-subscription.decorator.js';
import type { JwtPayload } from '../types/jwt-payload.js';

export const TRIAL_DAYS = 14;

// Equivale a isSubscriptionActive do legado: assinatura ativa ou trial vigente.
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ||
      this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (skip) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();

    if (user.is_active == 1) return true;

    if (user.trial_started_at) {
      const trialEnd =
        new Date(user.trial_started_at).getTime() +
        TRIAL_DAYS * 24 * 60 * 60 * 1000;
      if (Date.now() < trialEnd) return true;
    }

    throw new HttpException(
      'Sua assinatura ou período de teste expirou!',
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
