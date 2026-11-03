import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequiresPro } from '../decorators/requires-pro.decorator.js';
import { TRIAL_DAYS } from '../utils/plan.js';
import { SubscriptionGuard } from './subscription.guard.js';

class FreeController {
  handler() {}
}

@RequiresPro()
class ProController {
  handler() {}
}

const contextFor = (user: object, controller = ProController) =>
  ({
    getType: () => 'http',
    getHandler: () => controller.prototype.handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const expired = { is_active: 0, trial_started_at: daysAgo(TRIAL_DAYS + 1) };

describe('SubscriptionGuard', () => {
  const guard = new SubscriptionGuard(new Reflector());

  it('libera rota grátis mesmo com o teste vencido', () => {
    expect(guard.canActivate(contextFor(expired, FreeController))).toBe(true);
  });

  it('libera rota Pro com assinatura ativa', () => {
    expect(guard.canActivate(contextFor({ is_active: 1 }))).toBe(true);
  });

  it('libera rota Pro com o teste dentro do prazo', () => {
    const user = { is_active: 0, trial_started_at: daysAgo(TRIAL_DAYS - 1) };
    expect(guard.canActivate(contextFor(user))).toBe(true);
  });

  it('bloqueia rota Pro com o teste vencido com 402', () => {
    try {
      guard.canActivate(contextFor(expired));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(402);
    }
  });

  it('bloqueia rota Pro de quem nunca teve teste nem assinatura', () => {
    expect(() => guard.canActivate(contextFor({ is_active: 0 }))).toThrow(
      HttpException,
    );
  });
});
