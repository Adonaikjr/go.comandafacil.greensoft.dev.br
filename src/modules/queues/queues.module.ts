import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { Env } from '../../config/env.schema.js';
import { AuthModule } from '../auth/auth.module.js';
import { TokenService } from '../auth/token.service.js';
import { BillingModule } from '../billing/billing.module.js';
import { BlogModule } from '../blog/blog.module.js';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { DEFAULT_JOB_OPTIONS, QUEUE } from './queue-names.js';
import { bullBoardAuth } from './bull-board-auth.js';
import { DeliveryPollingProcessor } from './delivery-polling.processor.js';
import { StripeEventsProcessor } from './stripe-events.processor.js';
import { AiContentProcessor } from './ai-content.processor.js';
import { MaintenanceProcessor } from './maintenance.processor.js';
import { QueueSchedulerService } from './queue-scheduler.service.js';

const queues = Object.values(QUEUE).map((name) => ({ name }));

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
        prefix: 'comandafacil',
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    BullModule.registerQueue(...queues),
    BullBoardModule.forRootAsync({
      imports: [AuthModule],
      inject: [ConfigService, TokenService],
      useFactory: (config: ConfigService<Env, true>, tokens: TokenService) => ({
        route: '/admin/queues',
        adapter: ExpressAdapter,
        boardOptions: { uiConfig: { boardTitle: 'Comanda Fácil — Filas' } },
        middleware: bullBoardAuth(
          tokens,
          config.get('BULL_BOARD_USER', { infer: true }),
          config.get('BULL_BOARD_PASSWORD', { infer: true }),
        ),
      }),
    }),
    BullBoardModule.forFeature(
      ...queues.map(({ name }) => ({ name, adapter: BullMQAdapter })),
    ),
    DeliveryModule,
    BillingModule,
    BlogModule,
  ],
  providers: [
    DeliveryPollingProcessor,
    StripeEventsProcessor,
    AiContentProcessor,
    MaintenanceProcessor,
    QueueSchedulerService,
  ],
  exports: [BullModule],
})
export class QueuesModule {}
