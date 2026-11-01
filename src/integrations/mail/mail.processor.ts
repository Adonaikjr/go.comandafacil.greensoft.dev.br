import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUE } from '../../modules/queues/queue-names.js';
import type { MailOptions } from './mail.service.js';
import { MailTransport } from './mail.transport.js';

@Processor(QUEUE.MAIL)
export class MailProcessor extends WorkerHost {
  constructor(private readonly transport: MailTransport) {
    super();
  }

  async process(job: Job<MailOptions>) {
    await this.transport.deliver(job.data);
  }
}
