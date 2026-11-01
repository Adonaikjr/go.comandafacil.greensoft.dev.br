import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionGuard, TRIAL_DAYS } from './subscription.guard.js';

const contextFor = (user: object) =>
  ({
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

describe('SubscriptionGuard', () => {
  const guard = new SubscriptionGuard(new Reflector());

  it('libera assinatura ativa', () => {
    expect(guard.canActivate(contextFor({ is_active: 1 }))).toBe(true);
  });

  it('libera trial dentro do prazo', () => {
    const user = { is_active: 0, trial_started_at: daysAgo(TRIAL_DAYS - 1) };
    expect(guard.canActivate(contextFor(user))).toBe(true);
  });

  it('bloqueia trial vencido com 402', () => {
    const user = { is_active: 0, trial_started_at: daysAgo(TRIAL_DAYS + 1) };
    try {
      guard.canActivate(contextFor(user));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(402);
    }
  });

  it('bloqueia quem nunca teve trial nem assinatura', () => {
    expect(() => guard.canActivate(contextFor({ is_active: 0 }))).toThrow(
      HttpException,
    );
  });
});
