import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/current-user.decorator.js';
import { RequiresPro } from '../../common/decorators/requires-pro.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody, ZodQuery } from '../../common/decorators/zod.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  dateFilterQuerySchema,
  type DateFilterQuery,
} from '../../common/utils/date-filter.js';
import { ReservationsService } from './reservations.service.js';
import {
  createReservationSchema,
  searchQuerySchema,
  updateReservationSchema,
  type CreateReservationDto,
  type UpdateReservationDto,
} from './dto/reservation.schema.js';

const MANAGE = [Scope.RESERVATIONS, Scope.MANAGE_RESERVATIONS];
const VIEW = [
  Scope.RESERVATIONS,
  Scope.MANAGE_RESERVATIONS,
  Scope.VIEW_RESERVATIONS,
];

// Rotas de backend-legado/src/routes/reservation.routes.js
@ApiTags('reservations')
@ApiCookieAuth('accessToken')
@RequiresPro()
@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly settings: SettingsService,
  ) {}

  @Get('init')
  @Scopes(...VIEW)
  async init(@TenantId() tenantId: number) {
    return { storeTables: await this.settings.getStoreTables(tenantId) };
  }

  @Post('add')
  @HttpCode(200)
  @Scopes(...MANAGE)
  @ZodBody(createReservationSchema)
  async create(
    @TenantId() tenantId: number,
    @Body() dto: CreateReservationDto,
  ) {
    const result = await this.reservations.create(tenantId, dto);
    return { success: true, message: 'Reservation Done.', ...result };
  }

  @Post('update/:id')
  @HttpCode(200)
  @Scopes(...MANAGE)
  @ZodBody(updateReservationSchema)
  async update(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReservationDto,
  ) {
    await this.reservations.update(tenantId, id, dto);
    return { success: true, message: 'Reservation Details Updated.' };
  }

  @Post('cancel/:id')
  @HttpCode(200)
  @Scopes(...MANAGE)
  async cancel(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.reservations.cancel(tenantId, id);
    return { success: true, message: 'Reservation Cancelled.' };
  }

  @Delete('delete/:id')
  @Scopes(...MANAGE)
  async remove(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.reservations.remove(tenantId, id);
    return { success: true, message: 'Reservation Deleted.' };
  }

  @Get('search')
  @Scopes(...VIEW)
  @ZodQuery(searchQuerySchema)
  async search(@TenantId() tenantId: number, @Query() { q }: { q: string }) {
    const result = await this.reservations.search(tenantId, q);
    if (!result.length) throw new NotFoundException('No results found!');
    return result;
  }

  @Get()
  @Scopes(...VIEW)
  @ZodQuery(dateFilterQuerySchema)
  list(
    @TenantId() tenantId: number,
    @Query() { type, from, to }: DateFilterQuery,
  ) {
    return this.reservations.list(tenantId, type, from, to);
  }
}
