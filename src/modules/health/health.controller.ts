import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE } from '../queues/queue-names.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE.MAINTENANCE) private readonly queue: Queue,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // O banco de dev é remoto: 1 s (padrão) não basta
      () =>
        this.prismaHealth.pingCheck('database', this.prisma, {
          timeout: 5_000,
        }),
      async () => {
        const redis = this.indicator.check('redis');
        try {
          const client = (await this.queue.client) as unknown as {
            ping(): Promise<string>;
          };
          await client.ping();
          return redis.up();
        } catch (error) {
          return redis.down({ message: (error as Error).message });
        }
      },
    ]);
  }
}
