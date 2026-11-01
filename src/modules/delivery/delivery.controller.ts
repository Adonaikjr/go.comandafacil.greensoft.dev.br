import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  InternalServerErrorException,
  type Type,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/current-user.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody } from '../../common/decorators/zod.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import type { DeliveryProvider } from './delivery-provider.js';
import { DeliveryService } from './delivery.service.js';

const LABEL = { ifood: 'iFood', keeta: 'Keeta' } as const;

// iFood e Keeta expõem exatamente as mesmas rotas no legado
// (ifood.routes.js / keeta.routes.js), mudando só os nomes dos campos.
export function createDeliveryController(
  name: 'ifood' | 'keeta',
  providerClass: Type<DeliveryProvider>,
): Type<unknown> {
  const storeField = name === 'ifood' ? 'merchant_id' : 'restaurant_id';
  const orderIdKey = `${name}OrderId`;
  const label = LABEL[name];

  const requiredMsg = `client_id, client_secret e ${storeField} são obrigatórios`;
  const credentialsSchema = z.object({
    client_id: z.string({ error: requiredMsg }).min(1, requiredMsg),
    client_secret: z.string({ error: requiredMsg }).min(1, requiredMsg),
    [storeField]: z.string({ error: requiredMsg }).min(1, requiredMsg),
  });
  const cancelSchema = z.object({ reason: z.string().optional() });

  @ApiTags(name)
  @ApiCookieAuth('accessToken')
  @Controller(name)
  class DeliveryController {
    readonly logger = new Logger(`${label}Controller`);

    constructor(
      readonly provider: DeliveryProvider,
      readonly delivery: DeliveryService,
    ) {}

    // Erros da API externa viram 500 com a mensagem do legado
    async run<T>(message: string, fn: () => Promise<T>) {
      try {
        return await fn();
      } catch (error) {
        this.logger.error(error);
        throw new InternalServerErrorException(message);
      }
    }

    @Get('credentials')
    @Scopes(Scope.SETTINGS)
    async getCredentials(@TenantId() tenantId: number) {
      const creds = await this.provider.findCredentials(tenantId);
      if (!creds) return { configured: false };
      // client_secret nunca é devolvido
      return {
        configured: true,
        [storeField]: creds.storeId,
        is_active: creds.isActive,
      };
    }

    @Post('credentials')
    @HttpCode(200)
    @Scopes(Scope.SETTINGS)
    @ZodBody(credentialsSchema)
    async saveCredentials(
      @TenantId() tenantId: number,
      @Body() dto: Record<string, string>,
    ) {
      await this.provider.saveCredentials(tenantId, {
        clientId: dto.client_id,
        clientSecret: dto.client_secret,
        storeId: dto[storeField],
      });
      return { success: true };
    }

    @Get()
    @Scopes(Scope.ORDERS)
    async list(@TenantId() tenantId: number) {
      const orders = await this.provider.listOpenLocal(tenantId);
      return orders.map(({ externalId: _id, ...order }) => order);
    }

    @Get('sync')
    @Scopes(Scope.ORDERS)
    async sync(@TenantId() tenantId: number) {
      const imported = await this.run(`Erro ao sincronizar com ${label}`, () =>
        this.delivery.sync(this.provider, tenantId),
      );
      return {
        synced: imported.length,
        orders: imported.map((o) => ({
          localId: o.localId,
          [orderIdKey]: o.externalId,
          status: o.status,
        })),
      };
    }

    @Get(`detail/:${orderIdKey}`)
    @Scopes(Scope.ORDERS)
    detail(
      @TenantId() tenantId: number,
      @Param(orderIdKey) externalId: string,
    ) {
      return this.run('Erro ao buscar pedido', () =>
        this.provider.getOrderDetail(tenantId, externalId),
      );
    }

    @Post(`confirm/:${orderIdKey}`)
    @HttpCode(200)
    @Scopes(Scope.ORDERS)
    async confirm(
      @TenantId() tenantId: number,
      @Param(orderIdKey) externalId: string,
    ) {
      await this.run('Erro ao confirmar pedido', () =>
        this.delivery.changeStatus(
          this.provider,
          tenantId,
          externalId,
          'confirm',
        ),
      );
      return { success: true };
    }

    @Post(`start-preparation/:${orderIdKey}`)
    @HttpCode(200)
    @Scopes(Scope.ORDERS)
    async startPreparation(
      @TenantId() tenantId: number,
      @Param(orderIdKey) externalId: string,
    ) {
      await this.run('Erro ao iniciar preparo', () =>
        this.delivery.changeStatus(
          this.provider,
          tenantId,
          externalId,
          'startPreparation',
        ),
      );
      return { success: true };
    }

    @Post(`ready/:${orderIdKey}`)
    @HttpCode(200)
    @Scopes(Scope.ORDERS)
    async ready(
      @TenantId() tenantId: number,
      @Param(orderIdKey) externalId: string,
    ) {
      await this.run('Erro ao marcar como pronto', () =>
        this.delivery.changeStatus(
          this.provider,
          tenantId,
          externalId,
          'readyToPickup',
        ),
      );
      return { success: true };
    }

    @Post(`cancel/:${orderIdKey}`)
    @HttpCode(200)
    @Scopes(Scope.ORDERS)
    @ZodBody(cancelSchema)
    async cancel(
      @TenantId() tenantId: number,
      @Param(orderIdKey) externalId: string,
      @Body() dto: z.infer<typeof cancelSchema>,
    ) {
      await this.run('Erro ao cancelar pedido', () =>
        this.delivery.changeStatus(
          this.provider,
          tenantId,
          externalId,
          'cancel',
          dto.reason,
        ),
      );
      return { success: true };
    }
  }

  // O provider certo é injetado pelo tipo concreto
  Reflect.defineMetadata(
    'design:paramtypes',
    [providerClass, DeliveryService],
    DeliveryController,
  );
  Object.defineProperty(DeliveryController, 'name', {
    value: `${label}Controller`,
  });
  return DeliveryController;
}
