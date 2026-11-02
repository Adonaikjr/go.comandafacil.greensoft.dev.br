import { Module } from '@nestjs/common';
import { MenuItemsModule } from '../menu-items/menu-items.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrdersService } from './orders.service.js';
import { InvoicesService } from './invoices.service.js';
import { PosController } from './pos.controller.js';
import { OrdersController } from './orders.controller.js';
import { KitchenController } from './kitchen.controller.js';
import { InvoicesController } from './invoices.controller.js';

// POS, pedidos, cozinha e faturas compartilham o mesmo domínio (orders)
@Module({
  imports: [MenuItemsModule, InventoryModule],
  controllers: [
    PosController,
    OrdersController,
    KitchenController,
    InvoicesController,
  ],
  providers: [OrdersService, InvoicesService],
  exports: [OrdersService],
})
export class OrdersModule {}
