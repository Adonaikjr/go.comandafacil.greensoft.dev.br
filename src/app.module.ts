import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard.js';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { validateEnv, type Env } from './config/env.schema.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { SubscriptionGuard } from './common/guards/subscription.guard.js';
import { ScopesGuard } from './common/guards/scopes.guard.js';
import { LegacySerializerInterceptor } from './common/interceptors/legacy-serializer.interceptor.js';
import { StripeModule } from './integrations/stripe/stripe.module.js';
import { MailModule } from './integrations/mail/mail.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { MenuItemsModule } from './modules/menu-items/menu-items.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { QrMenuModule } from './modules/qrmenu/qrmenu.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { StorageModule } from './integrations/storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: () => randomUUID(),
      },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const env = config.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            level: { development: 'debug', production: 'info', test: 'silent' }[
              env
            ],
            transport:
              env === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            serializers: {
              res: (res: { statusCode: number }) => ({
                statusCode: res.statusCode,
              }),
            },
          },
        };
      },
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
      }),
    }),
    // Mesmo limite que estava comentado no legado (1000 req/min)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
    PrismaModule,
    StripeModule,
    MailModule,
    StorageModule,
    HealthModule,
    RealtimeModule,
    AuthModule,
    BillingModule,
    CustomersModule,
    SettingsModule,
    MenuItemsModule,
    ReservationsModule,
    UsersModule,
    OrdersModule,
    ReportsModule,
    QrMenuModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LegacySerializerInterceptor },
    // A ordem importa: rate limit → autenticação → assinatura → escopos
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_GUARD, useClass: ScopesGuard },
  ],
})
export class AppModule {}
