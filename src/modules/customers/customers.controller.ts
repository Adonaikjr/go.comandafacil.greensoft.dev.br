import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/current-user.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import {
  ZodBody,
  ZodQuery,
  ZodResponse,
} from '../../common/decorators/zod.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import { CustomersService } from './customers.service.js';
import {
  createCustomerSchema,
  customerSchema,
  customersPageSchema,
  listCustomersQuerySchema,
  messageSchema,
  searchCustomersQuerySchema,
  updateCustomerSchema,
  type CreateCustomerDto,
  type ListCustomersQuery,
  type SearchCustomersQuery,
  type UpdateCustomerDto,
} from './dto/customer.schema.js';

// Rotas idênticas a backend-legado/src/routes/customer.routes.js
@ApiTags('customers')
@ApiCookieAuth('accessToken')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post('add')
  @HttpCode(200)
  @Scopes(Scope.MANAGE_CUSTOMERS)
  @ApiOperation({ summary: 'Cadastra um cliente' })
  @ZodBody(createCustomerSchema)
  @ZodResponse(messageSchema)
  async create(@TenantId() tenantId: number, @Body() dto: CreateCustomerDto) {
    await this.customers.create(tenantId, dto);
    return { success: true, message: `Customer: ${dto.phone} added.` };
  }

  @Get()
  @Scopes(Scope.CUSTOMERS, Scope.VIEW_CUSTOMERS)
  @ApiOperation({ summary: 'Lista clientes com paginação e filtro' })
  @ZodQuery(listCustomersQuerySchema)
  @ZodResponse(customersPageSchema)
  findAll(@TenantId() tenantId: number, @Query() query: ListCustomersQuery) {
    return this.customers.findAll(tenantId, query);
  }

  @Get('search-by-phone-name/search')
  @Scopes(Scope.CUSTOMERS, Scope.VIEW_CUSTOMERS)
  @ApiOperation({ summary: 'Busca clientes por telefone ou nome (máx. 10)' })
  @ZodQuery(searchCustomersQuerySchema)
  @ZodResponse(z.array(customerSchema))
  async search(
    @TenantId() tenantId: number,
    @Query() { q }: SearchCustomersQuery,
  ) {
    const result = await this.customers.search(tenantId, q);
    if (!result.length) throw new NotFoundException('No Customers found!');
    return result;
  }

  @Get(':id')
  @Scopes(Scope.CUSTOMERS, Scope.VIEW_CUSTOMERS)
  @ApiOperation({ summary: 'Busca um cliente pelo telefone' })
  @ZodResponse(customerSchema)
  async findOne(@TenantId() tenantId: number, @Param('id') phone: string) {
    const customer = await this.customers.findOne(tenantId, phone);
    if (!customer) {
      throw new NotFoundException(`No Customer found with Phone: ${phone}`);
    }
    return customer;
  }

  @Post(':id/update')
  @HttpCode(200)
  @Scopes(Scope.CUSTOMERS, Scope.MANAGE_CUSTOMERS)
  @ApiOperation({ summary: 'Atualiza os dados de um cliente' })
  @ZodBody(updateCustomerSchema)
  @ZodResponse(messageSchema)
  async update(
    @TenantId() tenantId: number,
    @Param('id') phone: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    await this.customers.update(tenantId, phone, dto);
    return { success: true, message: `Customer: ${phone} Details Updated.` };
  }

  @Delete(':id/delete')
  @Scopes(Scope.CUSTOMERS, Scope.MANAGE_CUSTOMERS)
  @ApiOperation({ summary: 'Remove um cliente' })
  @ZodResponse(messageSchema)
  async remove(@TenantId() tenantId: number, @Param('id') phone: string) {
    await this.customers.remove(tenantId, phone);
    return { success: true, message: `Customer: ${phone} Deleted.` };
  }
}
