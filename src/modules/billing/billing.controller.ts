import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import {
  CurrentUser,
  TenantId,
} from '../../common/decorators/current-user.decorator.js';
import { ZodBody } from '../../common/decorators/zod.decorator.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { AuthCookiesService } from '../auth/auth-cookies.service.js';
import { TokenService } from '../auth/token.service.js';
import { BillingService } from './billing.service.js';

const idSchema = z.object({
  id: z
    .string({ error: 'Solicitação inválida!' })
    .min(1, 'Solicitação inválida!'),
});

// Rotas de assinatura que o legado expõe em /auth
@ApiTags('billing')
@SkipSubscription()
@Controller('auth')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billing: BillingService,
    private readonly cookies: AuthCookiesService,
    private readonly tokens: TokenService,
  ) {}

  @Get('subscription-details')
  @Scopes()
  @ApiOperation({ summary: 'Dados da assinatura do tenant (somente admin)' })
  subscriptionDetails(@TenantId() tenantId: number) {
    return this.billing.getSubscriptionDetails(tenantId);
  }

  @Post('cancel-subscription')
  @HttpCode(200)
  @Scopes()
  @ApiOperation({ summary: 'Cancela a assinatura no Stripe (somente admin)' })
  @ZodBody(idSchema)
  async cancelSubscription(
    @CurrentUser() user: JwtPayload,
    @Body() { id }: z.infer<typeof idSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.billing.cancelSubscription(id);

    const { trial_started_at: _trial, ...rest } = user;
    const accessToken = this.tokens.signAccess({
      tenant_id: rest.tenant_id,
      is_active: 0,
      username: rest.username,
      name: rest.name,
      role: rest.role,
      scope: rest.scope,
      plan_type: rest.plan_type || 'basic',
    });
    this.cookies.setAccessCookie(res, accessToken);

    return {
      success: true,
      message:
        'Sua assinatura foi cancelada! Você não será mais cobrado pelo produto.',
    };
  }

  @Post('stripe-product-lookup')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cria a sessão de checkout do Stripe' })
  async productLookup(
    @CurrentUser() user: JwtPayload,
    @Body('id') priceId: string,
  ) {
    try {
      const url = await this.billing.createCheckoutSession(
        priceId,
        user.username,
        user.tenant_id,
      );
      return { success: true, url };
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(
        'Não é possível recuperar a assinatura do produto agora! Por favor, tente novamente mais tarde!',
      );
    }
  }

  @Public()
  @Post('stripe-webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
    @Res() res: Response,
  ) {
    let event;
    try {
      event = this.billing.constructEvent(req.rawBody, signature);
    } catch (error) {
      this.logger.warn(
        `Webhook signature verification failed: ${(error as Error).message}`,
      );
      return res.sendStatus(400);
    }

    try {
      await this.billing.handleEvent(event);
    } catch (error) {
      this.logger.error(error);
    }
    return res.send();
  }
}
