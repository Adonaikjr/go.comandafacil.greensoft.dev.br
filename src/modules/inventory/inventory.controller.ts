import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequiresPro } from '../../common/decorators/requires-pro.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody, ZodQuery } from '../../common/decorators/zod.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { InventoryService } from './inventory.service.js';
import {
  createInventoryItemSchema,
  createMovementSchema,
  listInventoryQuerySchema,
  listMovementsQuerySchema,
  updateInventoryItemSchema,
  type CreateInventoryItemDto,
  type CreateMovementDto,
  type ListInventoryQuery,
  type ListMovementsQuery,
  type UpdateInventoryItemDto,
} from './dto/inventory.schema.js';

// Módulo novo (não existia no legado). Segue o mesmo padrão de rotas dos
// outros módulos: add, update/:id, delete/:id.
const VIEW = [Scope.INVENTORY, Scope.VIEW_INVENTORY, Scope.MANAGE_INVENTORY];
const MANAGE = [Scope.INVENTORY, Scope.MANAGE_INVENTORY];

@ApiTags('inventory')
@ApiCookieAuth('accessToken')
@RequiresPro()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Scopes(...VIEW)
  @ApiOperation({ summary: 'Lista os itens de estoque com o saldo atual' })
  @ZodQuery(listInventoryQuerySchema)
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListInventoryQuery) {
    return this.inventory.findAll(user.tenant_id, query);
  }

  @Get('movements')
  @Scopes(...VIEW)
  @ApiOperation({ summary: 'Histórico de movimentações, paginado' })
  @ZodQuery(listMovementsQuerySchema)
  listMovements(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMovementsQuery,
  ) {
    return this.inventory.listMovements(user.tenant_id, query);
  }

  @Get(':id')
  @Scopes(...VIEW)
  @ApiOperation({ summary: 'Busca um item de estoque' })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inventory.findOne(user.tenant_id, id);
  }

  @Post('add')
  @HttpCode(200)
  @Scopes(...MANAGE)
  @ApiOperation({ summary: 'Cadastra um item, com saldo inicial opcional' })
  @ZodBody(createInventoryItemSchema)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateInventoryItemDto,
  ) {
    const inventoryItemId = await this.inventory.create(
      user.tenant_id,
      dto,
      user.username,
    );
    return {
      success: true,
      message: 'Inventory Item Added.',
      inventoryItemId,
    };
  }

  @Post('update/:id')
  @HttpCode(200)
  @Scopes(...MANAGE)
  @ApiOperation({ summary: 'Altera os dados do item (o saldo não muda)' })
  @ZodBody(updateInventoryItemSchema)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    await this.inventory.update(user.tenant_id, id, dto);
    return { success: true, message: 'Inventory Item Updated.' };
  }

  @Delete('delete/:id')
  @Scopes(...MANAGE)
  @ApiOperation({ summary: 'Exclui o item e o histórico dele' })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.inventory.remove(user.tenant_id, id);
    return { success: true, message: 'Inventory Item Deleted.' };
  }

  @Post(':id/movement')
  @HttpCode(200)
  @Scopes(...MANAGE)
  @ApiOperation({ summary: 'Registra entrada, saída ou ajuste de saldo' })
  @ZodBody(createMovementSchema)
  async addMovement(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMovementDto,
  ) {
    const quantity = await this.inventory.addMovement(
      user.tenant_id,
      id,
      dto,
      user.username,
    );
    return { success: true, message: 'Inventory Movement Added.', quantity };
  }
}
