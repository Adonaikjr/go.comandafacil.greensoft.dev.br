import { Module } from '@nestjs/common';
import { MenuItemsModule } from '../menu-items/menu-items.module.js';
import { PushModule } from '../push/push.module.js';
import { QrMenuController } from './qrmenu.controller.js';
import { QrMenuService } from './qrmenu.service.js';

@Module({
  imports: [MenuItemsModule, PushModule],
  controllers: [QrMenuController],
  providers: [QrMenuService],
})
export class QrMenuModule {}
