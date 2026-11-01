import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { DeliveryService } from '../delivery/delivery.service.js';
import { IfoodProvider } from '../delivery/ifood.provider.js';
import { KeetaProvider } from '../delivery/keeta.provider.js';
import type { DeliveryProvider } from '../delivery/delivery-provider.js';
import { QUEUE } from './queue-names.js';

// Substitui o polling manual do legado (GET /ifood/sync): a cada intervalo
// sincroniza todos os tenants com integração ativa. Um tenant com erro não
// impede os demais.
@Processor(QUEUE.DELIVERY, { concurrency: 1 })
export class DeliveryPollingProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryPollingProcessor.name);

  constructor(
    private readonly delivery: DeliveryService,
    private readonly ifood: IfoodProvider,
    private readonly keeta: KeetaProvider,
  ) {
    super();
  }

  async process(_job: Job) {
    let imported = 0;
    for (const provider of [this.ifood, this.keeta] as DeliveryProvider[]) {
      for (const tenantId of await provider.tenantsWithActiveCredentials()) {
        try {
          imported += (await this.delivery.sync(provider, tenantId)).length;
        } catch (error) {
          this.logger.warn(
            `${provider.name} tenant ${tenantId}: ${(error as Error).message}`,
          );
        }
      }
    }
    return { imported };
  }
}
