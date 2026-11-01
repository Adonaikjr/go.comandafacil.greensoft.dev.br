import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type Stripe from 'stripe';
import { BillingService } from '../billing/billing.service.js';
import { QUEUE } from './queue-names.js';

// O webhook só valida a assinatura e enfileira; aqui o evento é aplicado.
// O jobId é o id do evento no Stripe, então reenvios não duplicam.
@Processor(QUEUE.STRIPE)
export class StripeEventsProcessor extends WorkerHost {
  constructor(private readonly billing: BillingService) {
    super();
  }

  async process(job: Job<Stripe.Event>) {
    await this.billing.handleEvent(job.data);
  }
}
