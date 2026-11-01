import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { PUBLIC_DIR } from './integrations/storage/storage.service.js';

// Configuração compartilhada entre main.ts e os testes e2e
export function configureApp(app: NestExpressApplication) {
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', {
    // Fora do prefixo: health check, sitemap e o painel das filas
    exclude: ['health', 'sitemap.xml', 'admin/queues', 'admin/queues/{*path}'],
  });
  // Imagens enviadas (cardápio, perfil, loja) — mesmo caminho do legado
  app.useStaticAssets(PUBLIC_DIR, { prefix: '/public', maxAge: '7d' });
  return app;
}
