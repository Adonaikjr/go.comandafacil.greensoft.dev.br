import type { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import type { Env } from '../../config/env.schema.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { BillingService } from './billing.service.js';

const configWith = (env: Partial<Env>) =>
  ({ get: (key: keyof Env) => env[key] }) as unknown as ConfigService<
    Env,
    true
  >;

const forged = Buffer.from(
  JSON.stringify({ id: 'evt_x', type: 'customer.subscription.created' }),
);

describe('BillingService.constructEvent', () => {
  it('em produção sem STRIPE_WEBHOOK_SECRET recusa o evento', () => {
    const billing = new BillingService(
      {} as PrismaService,
      configWith({ NODE_ENV: 'production' }),
      {} as Stripe,
    );
    expect(() => billing.constructEvent(forged, undefined)).toThrow(
      'STRIPE_WEBHOOK_SECRET',
    );
  });

  it('em desenvolvimento sem segredo aceita (stripe listen local)', () => {
    const billing = new BillingService(
      {} as PrismaService,
      configWith({ NODE_ENV: 'development' }),
      {} as Stripe,
    );
    expect(billing.constructEvent(forged, undefined).id).toBe('evt_x');
  });

  it('com segredo valida a assinatura pelo SDK do Stripe', () => {
    const constructEvent = vi.fn(() => ({ id: 'evt_ok' }));
    const billing = new BillingService(
      {} as PrismaService,
      configWith({ NODE_ENV: 'production', STRIPE_WEBHOOK_SECRET: 'whsec' }),
      { webhooks: { constructEvent } } as unknown as Stripe,
    );
    expect(billing.constructEvent(forged, 'sig').id).toBe('evt_ok');
    expect(constructEvent).toHaveBeenCalledWith(forged, 'sig', 'whsec');
  });
});
