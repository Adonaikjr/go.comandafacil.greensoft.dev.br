import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodBody, ZodQuery } from '../../common/decorators/zod.decorator.js';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard.js';
import { flag, requiredText } from '../../common/zod/legacy.js';
import {
  dateFilterQuerySchema,
  type DateFilterQuery,
} from '../../common/utils/date-filter.js';
import { deviceFromRequest } from '../../common/utils/device.js';
import { asDbDateTime } from '../../common/utils/db-time.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthCookiesService } from '../auth/auth-cookies.service.js';
import { TokenService } from '../auth/token.service.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { SuperadminService } from './superadmin.service.js';

const signInSchema = z.object({
  username: requiredText(),
  password: requiredText(),
});

const addTenantSchema = z.object({
  name: requiredText('All fields are required'),
  email: requiredText('All fields are required'),
  password: requiredText('All fields are required'),
  isActive: flag,
});

const updateTenantSchema = z.object({
  name: requiredText('Missing required fields'),
  email: requiredText('Missing required fields'),
  isActive: z
    .union([z.number(), z.string(), z.boolean()], {
      error: 'Missing required fields',
    })
    .transform(Number),
});

const tenantsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    perPage: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine((q) => q.type !== 'custom' || (q.from && q.to), {
    message: 'Please provide required details from & to dates!',
  });

const visitorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  perPage: z.coerce.number().int().min(1).max(200).catch(20),
  search: z.string().catch(''),
  filterPage: z.string().catch(''),
});

const visitorSchema = z.object({
  page: z.string().max(100).optional().default('sales'),
  referrer: z.string().max(1000).nullish(),
  screen_resolution: z.string().max(30).nullish(),
  language: z.string().max(20).nullish(),
  timezone: z.string().max(100).nullish(),
});

interface SuperadminPayload {
  username: string;
  name: string | null;
  role: 'superadmin';
}

// Painel da Greensoft (backend-legado/src/routes/superadmin.routes.js)
@ApiTags('superadmin')
@ApiCookieAuth('accessToken')
@Controller('superadmin')
export class SuperadminController {
  constructor(
    private readonly superadmin: SuperadminService,
    private readonly tokens: TokenService,
    private readonly cookies: AuthCookiesService,
    private readonly prisma: PrismaService,
  ) {}

  // ---- Sessão ----

  @Public()
  @Post('signin')
  @HttpCode(200)
  @ZodBody(signInSchema)
  async signIn(
    @Body() dto: z.infer<typeof signInSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const admin = await this.superadmin.validateCredentials(
      dto.username,
      dto.password,
    );
    if (!admin)
      throw new UnauthorizedException('Email or Password is Invalid!');

    const payload: SuperadminPayload = {
      username: admin.email,
      name: admin.name,
      role: 'superadmin',
    };
    const accessToken = this.tokens.signAccess(
      payload as unknown as JwtPayload,
    );
    const refreshToken = this.tokens.signRefresh(
      payload as unknown as JwtPayload,
    );
    const refreshExpiry = this.cookies.refreshExpiry();
    this.cookies.setLoginCookies(
      res,
      accessToken,
      refreshToken,
      refreshExpiry,
      { crossSite: false },
    );

    const device = deviceFromRequest(req);
    await this.prisma.refresh_tokens.create({
      data: {
        username: dto.username,
        refresh_token: refreshToken,
        expiry: asDbDateTime(refreshExpiry),
        device_ip: device.ip,
        device_name: device.name,
      },
    });
    return {
      success: true,
      message: 'Login Successful.',
      accessToken,
      user: payload,
    };
  }

  private verifyRefresh(req: Request) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken)
      throw new UnauthorizedException('Login again to access this area!');
    try {
      return {
        refreshToken,
        user: this.tokens.verify(refreshToken) as unknown as SuperadminPayload,
      };
    } catch {
      throw new UnauthorizedException('Unauthorized access!');
    }
  }

  @Public()
  @Post('signout')
  @HttpCode(200)
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, user } = this.verifyRefresh(req);
    this.cookies.clearAll(res);
    await this.prisma.refresh_tokens.deleteMany({
      where: { username: user.username, refresh_token: refreshToken },
    });
    return { success: true, message: 'Logout Successful.' };
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, user } = this.verifyRefresh(req);
    const stored = await this.prisma.refresh_tokens.findFirst({
      where: { refresh_token: refreshToken },
      select: { username: true },
    });
    const admin = stored
      ? await this.superadmin.findAdmin(user.username)
      : null;
    if (!admin) {
      this.cookies.clearAll(res);
      res.status(401);
      return { loginNeeded: true, message: 'Login again to access this page.' };
    }
    const payload: SuperadminPayload = {
      username: admin.email,
      name: admin.name,
      role: 'superadmin',
    };
    const accessToken = this.tokens.signAccess(
      payload as unknown as JwtPayload,
    );
    this.cookies.setAccessCookie(res, accessToken);
    return {
      success: true,
      message: 'New Token Created Successfully.',
      accessToken,
    };
  }

  // ---- Painel ----

  @Get('dashboard')
  @UseGuards(SuperAdminGuard)
  async dashboard() {
    const today = { type: 'today' };
    const [activeTenants, ordersProcessedToday, salesVolumeToday] =
      await Promise.all([
        this.superadmin.activeTenants(),
        this.superadmin.ordersProcessed(today),
        this.superadmin.salesVolume(today),
      ]);
    // O legado devolvia a contagem de tenants ativos como MRR e ARR
    return {
      activeTenants,
      ordersProcessedToday,
      salesVolumeToday,
      mrr: activeTenants,
      arr: activeTenants,
    };
  }

  @Get('tenantsData')
  @UseGuards(SuperAdminGuard)
  async tenantsCount() {
    const [activeTenants, inactiveTenants, allTenants] = await Promise.all([
      this.superadmin.activeTenants(),
      this.superadmin.inactiveTenants(),
      this.superadmin.allTenants(),
    ]);
    return { activeTenants, inactiveTenants, allTenants };
  }

  @Get('tenants')
  @UseGuards(SuperAdminGuard)
  @ZodQuery(tenantsQuerySchema)
  tenants(@Query() query: z.infer<typeof tenantsQuerySchema>) {
    return this.superadmin.listTenants(query);
  }

  @Get('tenants/:id/subscription-history')
  @UseGuards(SuperAdminGuard)
  tenantHistory(@Param('id', ParseIntPipe) id: number) {
    return this.superadmin.tenantDetails(id);
  }

  @Post('tenants/add')
  @HttpCode(200)
  @UseGuards(SuperAdminGuard)
  @ZodBody(addTenantSchema)
  async addTenant(@Body() dto: z.infer<typeof addTenantSchema>) {
    const tenant = await this.superadmin.addTenant({
      ...dto,
      isActive: !!dto.isActive,
    });
    return { message: 'Tenant added successfully', tenant };
  }

  @Patch('tenants/update/:id')
  @UseGuards(SuperAdminGuard)
  @ZodBody(updateTenantSchema)
  async updateTenant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: z.infer<typeof updateTenantSchema>,
  ) {
    await this.superadmin.updateTenant(id, dto);
    return { message: 'Tenant updated successfully' };
  }

  @Delete('tenants/delete/:id')
  @UseGuards(SuperAdminGuard)
  async deleteTenant(@Param('id', ParseIntPipe) id: number) {
    await this.superadmin.deleteTenant(id);
    return { success: true, message: 'Tenant Deleted Successfully.' };
  }

  @Get('tenantsData/:status')
  @UseGuards(SuperAdminGuard)
  tenantsByStatus(@Param('status') status: string) {
    const map: Record<string, 0 | 1 | null> = {
      active: 1,
      inactive: 0,
      all: null,
    };
    if (!(status in map))
      throw new BadRequestException('Invalid Status. Try Again Later !');
    return this.superadmin.tenantsByStatus(map[status]);
  }

  @Get('reports')
  @UseGuards(SuperAdminGuard)
  @ZodQuery(dateFilterQuerySchema)
  async reports(@Query() period: DateFilterQuery) {
    const [
      activeTenants,
      totalCustomers,
      topSellingItems,
      salesVolume,
      ordersProcessed,
    ] = await Promise.all([
      this.superadmin.activeTenants(),
      this.superadmin.totalCustomers(),
      this.superadmin.topSellingItems(period),
      this.superadmin.salesVolume(period),
      this.superadmin.ordersProcessed(period),
    ]);
    return {
      activeTenants,
      mrr: activeTenants,
      arr: activeTenants,
      totalCustomers,
      topSellingItems,
      salesVolume,
      ordersProcessed,
    };
  }

  // ---- Visitantes ----

  @Public()
  @Post('visitors/log')
  @HttpCode(200)
  @ZodBody(visitorSchema)
  async logVisitor(
    @Body() dto: z.infer<typeof visitorSchema>,
    @Req() req: Request,
  ) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : undefined) ||
      (req.headers['x-real-ip'] as string | undefined) ||
      req.socket.remoteAddress ||
      null;
    await this.superadmin.logVisitor({
      ...dto,
      ip_address: ip,
      user_agent: req.headers['user-agent'] ?? null,
    });
    return { success: true };
  }

  @Get('visitors')
  @UseGuards(SuperAdminGuard)
  @ZodQuery(visitorsQuerySchema)
  async visitors(@Query() query: z.infer<typeof visitorsQuerySchema>) {
    const { visitors, total, stats } = await this.superadmin.visitors(query);
    return {
      success: true,
      visitors,
      total,
      totalPages: Math.ceil(total / query.perPage),
      currentPage: query.page,
      perPage: query.perPage,
      stats,
    };
  }
}
