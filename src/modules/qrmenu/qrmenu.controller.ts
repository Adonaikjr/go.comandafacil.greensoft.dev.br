import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodBody } from '../../common/decorators/zod.decorator.js';
import { optionalNumber, optionalText } from '../../common/zod/legacy.js';
import { SettingsService } from '../settings/settings.service.js';
import { MenuItemsService } from '../menu-items/menu-items.service.js';
import { cartItemSchema } from '../orders/dto/order.schema.js';
import { QrMenuService } from './qrmenu.service.js';

const placeOrderSchema = z.object({
  deliveryType: optionalText,
  cartItems: z
    .array(cartItemSchema, { error: 'Cart is empty!' })
    .min(1, 'Cart is empty!'),
  customerType: z.enum(['WALKIN', 'CUSTOMER']).nullish(),
  customer: z
    .looseObject({ phone: optionalText, name: optionalText })
    .nullish(),
  tableId: optionalNumber,
});
type PlaceOrderDto = z.infer<typeof placeOrderSchema>;

// Cardápio digital público (backend-legado/src/routes/qrmenu.routes.js)
@ApiTags('qrmenu')
@Public()
@Controller('qrmenu')
export class QrMenuController {
  constructor(
    private readonly settings: SettingsService,
    private readonly menu: MenuItemsService,
    private readonly qrmenu: QrMenuService,
  ) {}

  private async tenantFromCode(qrcode: string) {
    const tenantId = await this.settings.getTenantIdFromQRCode(qrcode);
    if (!tenantId) throw new NotFoundException('QR/Digital Menu not found!');
    return tenantId;
  }

  @Get(':qrcode')
  async init(
    @Param('qrcode') qrcode: string,
    @Query('tableId') tableId?: string,
  ) {
    const tenantId = await this.tenantFromCode(qrcode);
    const [categories, storeSettings, storeTable, menuItems] =
      await Promise.all([
        this.settings.getCategories(tenantId),
        this.settings.getStoreRow(tenantId),
        tableId
          ? this.settings.getStoreTableByEncryptedId(tenantId, tableId)
          : null,
        this.menu.findAllWithExtras(tenantId),
      ]);
    return { categories, storeSettings, menuItems, storeTable };
  }

  @Post(':qrcode/place-order')
  @HttpCode(200)
  @ZodBody(placeOrderSchema)
  async placeOrder(
    @Param('qrcode') qrcode: string,
    @Body() dto: PlaceOrderDto,
  ) {
    const tenantId = await this.tenantFromCode(qrcode);
    const orderId = await this.qrmenu.placeOrder(tenantId, {
      deliveryType: dto.deliveryType,
      cartItems: dto.cartItems,
      customerType: dto.customerType,
      phone: dto.customer?.phone ?? null,
      name: dto.customer?.name ?? null,
      tableId: dto.tableId || null,
    });
    return { success: true, message: 'Order Placed Successfully', orderId };
  }
}
