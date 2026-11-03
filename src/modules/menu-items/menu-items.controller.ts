import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/current-user.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody } from '../../common/decorators/zod.decorator.js';
import { ApiImageUpload } from '../../common/decorators/api-image-upload.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import { StorageService } from '../../integrations/storage/storage.service.js';
import { MenuItemsService } from './menu-items.service.js';
import {
  menuItemExtraSchema,
  menuItemSchema,
  type MenuItemDto,
  type MenuItemExtraDto,
} from './dto/menu-item.schema.js';

// Rotas de backend-legado/src/routes/menu_item.routes.js
@ApiTags('menu-items')
@ApiCookieAuth('accessToken')
@Scopes(Scope.SETTINGS)
@Controller('menu-items')
export class MenuItemsController {
  constructor(
    private readonly menu: MenuItemsService,
    private readonly storage: StorageService,
  ) {}

  @Post('add')
  @HttpCode(200)
  @ZodBody(menuItemSchema)
  async create(@TenantId() tenantId: number, @Body() dto: MenuItemDto) {
    const menuItemId = await this.menu.create(tenantId, dto);
    return { success: true, message: 'Menu Item Added.', menuItemId };
  }

  @Post('update/:id')
  @HttpCode(200)
  @ZodBody(menuItemSchema)
  async update(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MenuItemDto,
  ) {
    await this.menu.update(tenantId, id, dto);
    return { success: true, message: 'Menu Item Updated.' };
  }

  @Post('update/:id/upload-photo')
  @HttpCode(200)
  @ApiImageUpload()
  async uploadPhoto(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Please provide an image!');
    const imageURL = await this.storage.saveImage(
      file.buffer,
      `${tenantId}/${id}.webp`,
      {
        width: 800,
        height: 800,
      },
    );
    await this.menu.updateImage(tenantId, id, imageURL);
    return { success: true, message: 'Menu Item Image Uploaded.', imageURL };
  }

  @Post('update/:id/remove-photo')
  @HttpCode(200)
  async removePhoto(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.storage.remove(`${tenantId}/${id}.webp`);
    await this.menu.updateImage(tenantId, id, null);
    return { success: true, message: 'Menu Item Image Removed.' };
  }

  @Delete('delete/:id')
  async remove(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.menu.remove(tenantId, id);
    return { success: true, message: 'Menu Item Deleted.' };
  }

  @Get()
  findAll(@TenantId() tenantId: number) {
    return this.menu.findAllWithExtras(tenantId);
  }

  // No legado estas duas listas ficavam inacessíveis (capturadas por GET /:id)
  @Get('addons')
  getAllAddons(@TenantId() tenantId: number) {
    return this.menu.getAllAddons(tenantId);
  }

  @Get('variants')
  getAllVariants(@TenantId() tenantId: number) {
    return this.menu.getAllVariants(tenantId);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.menu.findOneWithExtras(tenantId, id);
  }

  // ---- Adicionais ----

  @Post('addons/:id/add')
  @HttpCode(200)
  @ZodBody(menuItemExtraSchema)
  async addAddon(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) itemId: number,
    @Body() dto: MenuItemExtraDto,
  ) {
    const addonId = await this.menu.addAddon(tenantId, itemId, dto);
    return { success: true, message: 'Menu Item Addon Added.', addonId };
  }

  @Post('addons/:id/update/:addonId')
  @HttpCode(200)
  @ZodBody(menuItemExtraSchema)
  async updateAddon(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) itemId: number,
    @Param('addonId', ParseIntPipe) addonId: number,
    @Body() dto: MenuItemExtraDto,
  ) {
    await this.menu.updateAddon(tenantId, itemId, addonId, dto);
    return { success: true, message: 'Menu Item Addon Updated.' };
  }

  @Delete('addons/:id/delete/:addonId')
  async deleteAddon(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) itemId: number,
    @Param('addonId', ParseIntPipe) addonId: number,
  ) {
    await this.menu.deleteAddon(tenantId, itemId, addonId);
    return { success: true, message: 'Menu Item Addon Deleted.' };
  }

  @Get('addons/:id')
  async getAddons(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) itemId: number,
  ) {
    const addons = await this.menu.getAddons(tenantId, itemId);
    if (!addons.length)
      throw new NotFoundException('No addons found for this item!');
    return addons;
  }

  // ---- Variações ----

  @Post('variants/:id/add')
  @HttpCode(200)
  @ZodBody(menuItemExtraSchema)
  async addVariant(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) itemId: number,
    @Body() dto: MenuItemExtraDto,
  ) {
    const variantId = await this.menu.addVariant(tenantId, itemId, dto);
    return { success: true, message: 'Menu Item Variant Added.', variantId };
  }

  @Post('variants/:id/update/:variantId')
  @HttpCode(200)
  @ZodBody(menuItemExtraSchema)
  async updateVariant(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) itemId: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() dto: MenuItemExtraDto,
  ) {
    await this.menu.updateVariant(tenantId, itemId, variantId, dto);
    return { success: true, message: 'Menu Item Variant Updated.' };
  }

  @Delete('variants/:id/delete/:variantId')
  async deleteVariant(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) itemId: number,
    @Param('variantId', ParseIntPipe) variantId: number,
  ) {
    await this.menu.deleteVariant(tenantId, itemId, variantId);
    return { success: true, message: 'Menu Item Variant Deleted.' };
  }

  @Get('variants/:id')
  async getVariants(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) itemId: number,
  ) {
    const variants = await this.menu.getVariants(tenantId, itemId);
    if (!variants.length)
      throw new NotFoundException('No variants found for this item!');
    return variants;
  }
}
