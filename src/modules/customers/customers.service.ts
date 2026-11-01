import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  toSqlDate,
  toSqlDateTime,
  toTinyInt,
} from '../../common/utils/legacy-format.js';
import type {
  CreateCustomerDto,
  ListCustomersQuery,
  UpdateCustomerDto,
} from './dto/customer.schema.js';

const customerSelect = {
  phone: true,
  name: true,
  email: true,
  birth_date: true,
  gender: true,
  is_member: true,
  created_at: true,
} satisfies Prisma.customersSelect;

type CustomerRow = Prisma.customersGetPayload<{
  select: typeof customerSelect;
}>;

const toDate = (value: string | null) =>
  value ? new Date(`${value}T00:00:00Z`) : null;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: number, dto: CreateCustomerDto) {
    const exists = await this.prisma.customers.findUnique({
      where: { phone_tenant_id: { phone: dto.phone, tenant_id: tenantId } },
      select: { phone: true },
    });

    if (exists) {
      throw new BadRequestException(
        `Customer with Phone: ${dto.phone} Already exists!`,
      );
    }

    await this.prisma.customers.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        email: dto.email,
        birth_date: toDate(dto.birthDate),
        gender: dto.gender,
        is_member: dto.isMember,
        tenant_id: tenantId,
      },
    });
  }

  async findAll(tenantId: number, query: ListCustomersQuery) {
    const { page, perPage, sort, filter } = query;

    const where: Prisma.customersWhereInput = { tenant_id: tenantId };
    if (filter) {
      where.OR = [{ name: { startsWith: filter } }, { phone: filter }];
    }

    const [customers, totalCustomers] = await this.prisma.$transaction([
      this.prisma.customers.findMany({
        where,
        select: customerSelect,
        orderBy: sort ? { [sort]: 'asc' } : { created_at: 'desc' },
        take: perPage,
        skip: (page - 1) * perPage,
      }),
      this.prisma.customers.count({ where }),
    ]);

    return {
      customers: customers.map(toResponse),
      currentPage: page,
      perPage,
      totalPages: Math.ceil(totalCustomers / perPage),
      totalCustomers,
    };
  }

  async findOne(tenantId: number, phone: string) {
    const customer = await this.prisma.customers.findUnique({
      where: { phone_tenant_id: { phone, tenant_id: tenantId } },
      select: customerSelect,
    });
    return customer ? toResponse(customer) : null;
  }

  async search(tenantId: number, q: string) {
    const customers = await this.prisma.customers.findMany({
      where: {
        tenant_id: tenantId,
        OR: [{ phone: { startsWith: q } }, { name: { contains: q } }],
      },
      select: customerSelect,
      take: 10,
    });
    return customers.map(toResponse);
  }

  async update(tenantId: number, phone: string, dto: UpdateCustomerDto) {
    await this.prisma.customers.updateMany({
      where: { phone, tenant_id: tenantId },
      data: {
        name: dto.name,
        email: dto.email,
        birth_date: toDate(dto.birthDate),
        gender: dto.gender,
      },
    });
  }

  async remove(tenantId: number, phone: string) {
    await this.prisma.customers.deleteMany({
      where: { phone, tenant_id: tenantId },
    });
  }
}

function toResponse(row: CustomerRow) {
  return {
    ...row,
    birth_date: toSqlDate(row.birth_date),
    is_member: toTinyInt(row.is_member),
    created_at: toSqlDateTime(row.created_at),
  };
}
