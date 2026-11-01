import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../../modules/queues/queue-names.js';
import { MailService } from './mail.service.js';
import { MailTransport } from './mail.transport.js';
import { MailProcessor } from './mail.processor.js';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE.MAIL })],
  providers: [MailService, MailTransport, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
