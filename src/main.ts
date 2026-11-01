import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter.js';
import type { Env } from './config/env.schema.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Necessário para validar a assinatura do webhook do Stripe
    rawBody: true,
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.use(
    helmet({
      contentSecurityPolicy: false,
      // As imagens de /public são exibidas pelo frontend (outro domínio)
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const origins = [
    config.get('FRONTEND_DOMAIN', { infer: true }),
    ...(config.get('CORS_EXTRA_ORIGINS', { infer: true })?.split(',') ?? []),
  ].map((o) => o.trim());
  app.enableCors({ credentials: true, origin: origins });

  const ioAdapter = new RedisIoAdapter(app, origins);
  await ioAdapter.connectToRedis(config.get('REDIS_URL', { infer: true }));
  app.useWebSocketAdapter(ioAdapter);

  configureApp(app);
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Comanda Fácil API')
      .setVersion('1.0')
      .addCookieAuth('accessToken')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/json' });
  app.use('/reference', apiReference({ content: document }));

  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
