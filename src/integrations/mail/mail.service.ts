import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE } from '../../modules/queues/queue-names.js';

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

// Enfileira o e-mail; o envio (com retentativas) fica no MailProcessor
@Injectable()
export class MailService {
  constructor(
    @InjectQueue(QUEUE.MAIL) private readonly queue: Queue<MailOptions>,
  ) {}

  async send(mail: MailOptions) {
    await this.queue.add('send', mail);
  }
}
