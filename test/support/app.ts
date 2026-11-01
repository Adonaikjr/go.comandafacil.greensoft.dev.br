import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { MailService } from '../../src/integrations/mail/mail.service.js';
import { Role } from '../../src/common/enums/role.enum.js';

export const sentMails: { to: string; subject: string; html: string }[] = [];

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue({
      send: async (mail: (typeof sentMails)[number]) => sentMails.push(mail),
    })
    .compile();

  const app = moduleRef.createNestApplication<INestApplication>({
    logger: false,
    rawBody: true,
  });
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'sitemap.xml'] });
  await app.init();
  return app;
}

// Cria um tenant temporário com um admin e devolve um token válido.
// Remova com `prisma.tenants.delete` no afterAll (FKs com cascade limpam o resto).
export async function createTenant(app: INestApplication, name = 'e2e') {
  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);
  const tenant = await prisma.tenants.create({ data: { name, is_active: 1 } });
  const username = `e2e-admin-${tenant.id}-${Date.now()}`;
  await prisma.users.create({
    data: { username, password: 'x', role: Role.ADMIN, tenant_id: tenant.id },
  });

  const token = jwt.sign(
    {
      tenant_id: tenant.id,
      username,
      name,
      role: Role.ADMIN,
      scope: null,
      is_active: 1,
      plan_type: 'basic',
    },
    { issuer: process.env.FRONTEND_DOMAIN_COOKIE, expiresIn: '10m' },
  );

  const http = request(app.getHttpServer());
  return {
    tenantId: tenant.id,
    username,
    token,
    prisma,
    get: (url: string) => http.get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) =>
      http.post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => http.put(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) =>
      http.patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) =>
      http.delete(url).set('Authorization', `Bearer ${token}`),
    cleanup: () => prisma.tenants.delete({ where: { id: tenant.id } }),
  };
}
