import { Module } from '@nestjs/common';
import { MenuItemsModule } from '../menu-items/menu-items.module.js';
import { QrMenuController } from './qrmenu.controller.js';
import { QrMenuService } from './qrmenu.service.js';

@Module({
  imports: [MenuItemsModule],
  controllers: [QrMenuController],
  providers: [QrMenuService],
})
export class QrMenuModule {}
