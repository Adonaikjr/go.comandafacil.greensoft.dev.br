import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../../config/env.schema.js';

export const STRIPE = Symbol('STRIPE');

@Global()
@Module({
  providers: [
    {
      provide: STRIPE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Stripe(config.get('STRIPE_SECRET', { infer: true }) ?? ''),
    },
  ],
  exports: [STRIPE],
})
export class StripeModule {}
