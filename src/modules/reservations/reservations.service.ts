import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { dateFilterSql } from '../../common/utils/date-filter.js';
import {
  nowAsDbDateTime,
  parseDbDateTime,
} from '../../common/utils/db-time.js';
import type {
  CreateReservationDto,
  UpdateReservationDto,
} from './dto/reservation.schema.js';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: number, dto: CreateReservationDto) {
    const uniqueCode = nanoid(10);
    const reservation = await this.prisma.reservations.create({
      data: {
        customer_id: dto.customerId,
        date: parseDbDateTime(dto.date!),
        table_id: dto.tableId,
        status: dto.status,
        notes: dto.notes,
        people_count: dto.peopleCount,
        unique_code: uniqueCode,
        tenant_id: tenantId,
      },
    });
    return { reservationId: reservation.id, uniqueCode };
  }

  async update(tenantId: number, id: number, dto: UpdateReservationDto) {
    await this.prisma.reservations.updateMany({
      where: { id, tenant_id: tenantId },
      data: {
        date: dto.date ? parseDbDateTime(dto.date) : null,
        table_id: dto.tableId,
        status: dto.status,
        notes: dto.notes,
        people_count: dto.peopleCount,
        updated_at: nowAsDbDateTime(),
      },
    });
  }

  async cancel(tenantId: number, id: number) {
    await this.prisma.reservations.updateMany({
      where: { id, tenant_id: tenantId },
      data: { status: 'CANCELLED' },
    });
  }

  async remove(tenantId: number, id: number) {
    await this.prisma.reservations.deleteMany({
      where: { id, tenant_id: tenantId },
    });
  }

  private select(where: Prisma.Sql, suffix = Prisma.empty) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT r.id, customer_id, c.name AS customer_name, r.date, table_id, st.table_title,
             status, notes, people_count, unique_code, r.created_at, r.updated_at
      FROM reservations r
      INNER JOIN customers c ON r.customer_id = c.phone AND r.tenant_id = c.tenant_id
      LEFT JOIN store_tables st ON r.table_id = st.id
      WHERE ${where}
      ${suffix}`;
  }

  search(tenantId: number, q: string) {
    return this.select(
      Prisma.sql`r.tenant_id = ${tenantId} AND (r.id = ${q} OR customer_id = ${q} OR unique_code = ${q})`,
      Prisma.sql`ORDER BY r.created_at DESC LIMIT 20`,
    );
  }

  list(tenantId: number, type: string, from?: string, to?: string) {
    return this.select(
      Prisma.sql`${dateFilterSql(Prisma.raw('date'), type, from, to)} AND r.tenant_id = ${tenantId}`,
    );
  }
}
