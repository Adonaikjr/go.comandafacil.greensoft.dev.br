import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { nowAsDbDateTime } from '../../common/utils/db-time.js';
import { QUEUE } from './queue-names.js';

// Limpeza diária (no legado: utils/clear_sequence_tokens.js, rodado à mão)
@Processor(QUEUE.MAINTENANCE)
export class MaintenanceProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(_job: Job) {
    const now = nowAsDbDateTime();
    const [refreshTokens, resetTokens] = await this.prisma.$transaction([
      this.prisma.refresh_tokens.deleteMany({ where: { expiry: { lt: now } } }),
      this.prisma.reset_password_tokens.deleteMany({
        where: { expires_at: { lt: now } },
      }),
    ]);
    return {
      refreshTokens: refreshTokens.count,
      resetTokens: resetTokens.count,
    };
  }
}
