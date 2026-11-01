import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Env } from '../../config/env.schema.js';
import { QUEUE } from './queue-names.js';

// Registra os jobs recorrentes no Redis (idempotente: upsert pelo id).
// Funciona com várias instâncias da API, pois só um worker pega cada execução.
@Injectable()
export class QueueSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(QueueSchedulerService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(QUEUE.DELIVERY) private readonly delivery: Queue,
    @InjectQueue(QUEUE.MAINTENANCE) private readonly maintenance: Queue,
    @InjectQueue(QUEUE.AI) private readonly ai: Queue,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;

    await this.delivery.upsertJobScheduler(
      'poll-all',
      { every: this.config.get('DELIVERY_POLL_INTERVAL_MS', { infer: true }) },
      {
        name: 'poll',
        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 500 },
      },
    );
    await this.maintenance.upsertJobScheduler(
      'daily-cleanup',
      { pattern: '0 4 * * *', tz: 'America/Sao_Paulo' },
      { name: 'cleanup' },
    );

    const blogCron = this.config.get('BLOG_AI_CRON', { infer: true });
    if (blogCron) {
      await this.ai.upsertJobScheduler(
        'blog-post',
        { pattern: blogCron, tz: 'America/Sao_Paulo' },
        { name: 'generate-post' },
      );
    } else {
      await this.ai.removeJobScheduler('blog-post');
    }
    this.logger.log('Jobs recorrentes registrados');
  }
}
