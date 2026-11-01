import { Injectable, Logger } from '@nestjs/common';
import { RealtimeService } from '../realtime/realtime.service.js';
import type { DeliveryProvider } from './delivery-provider.js';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(private readonly realtime: RealtimeService) {}

  // Busca pedidos novos no marketplace, grava localmente e confirma o
  // recebimento dos eventos. Usado pela rota /sync e pelo job de polling.
  async sync(provider: DeliveryProvider, tenantId: number) {
    const orders = await provider.fetchNewOrders(tenantId);
    const imported: { localId: number; externalId: string; status: string }[] =
      [];

    for (const order of orders) {
      const localId = await provider.saveLocal(tenantId, order);
      if (order.ackId) await provider.acknowledge(tenantId, [order.ackId]);
      imported.push({
        localId,
        externalId: order.externalId,
        status: order.status,
      });
    }

    if (imported.length) {
      this.logger.log(
        `${provider.name}: ${imported.length} pedido(s) do tenant ${tenantId}`,
      );
      this.realtime.emitToTenant(tenantId, 'order_update', {
        source: provider.name,
      });
    }
    return imported;
  }

  async changeStatus(
    provider: DeliveryProvider,
    tenantId: number,
    externalId: string,
    action: 'confirm' | 'startPreparation' | 'readyToPickup' | 'cancel',
    reason?: string,
  ) {
    const localStatus = {
      confirm: 'CONFIRMED',
      startPreparation: 'IN_PREPARATION',
      readyToPickup: 'READY_TO_PICKUP',
      cancel: 'CANCELLED',
    }[action];

    if (action === 'cancel')
      await provider.cancel(tenantId, externalId, reason);
    else await provider[action](tenantId, externalId);
    await provider.updateLocalStatus(tenantId, externalId, localStatus);
  }
}
