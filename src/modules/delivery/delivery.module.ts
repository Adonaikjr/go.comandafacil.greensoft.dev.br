import { Module } from '@nestjs/common';
import { DeliveryService } from './delivery.service.js';
import { IfoodProvider } from './ifood.provider.js';
import { KeetaProvider } from './keeta.provider.js';
import { createDeliveryController } from './delivery.controller.js';

export const IfoodController = createDeliveryController('ifood', IfoodProvider);
export const KeetaController = createDeliveryController('keeta', KeetaProvider);

@Module({
  controllers: [IfoodController, KeetaController],
  providers: [DeliveryService, IfoodProvider, KeetaProvider],
  exports: [DeliveryService, IfoodProvider, KeetaProvider],
})
export class DeliveryModule {}
