import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Role } from '../src/common/enums/role.enum.js';
import { Scope } from '../src/common/enums/scope.enum.js';

// Usa o banco do DATABASE_URL: cria um tenant temporário e o remove no final
// (as FKs com ON DELETE CASCADE limpam clientes e usuários).
describe('Customers (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantId: number;
  let adminToken: string;
  let viewerToken: string;
  let expiredToken: string;

  const phone = `9${Date.now().toString().slice(-10)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const issuer = process.env.FRONTEND_DOMAIN_COOKIE;

    const tenant = await prisma.tenants.create({
      data: { name: 'e2e-customers', is_active: 1 },
    });
    tenantId = tenant.id;

    const viewerScope = Scope.VIEW_CUSTOMERS;
    await prisma.users.createMany({
      data: [
        {
          username: `e2e-admin-${tenantId}`,
          password: 'x',
          role: Role.ADMIN,
          tenant_id: tenantId,
        },
        {
          username: `e2e-viewer-${tenantId}`,
          password: 'x',
          role: Role.USER,
          scope: viewerScope,
          tenant_id: tenantId,
        },
      ],
    });

    const base = { tenant_id: tenantId, name: 'e2e', plan_type: 'basic' };
    adminToken = jwt.sign(
      {
        ...base,
        username: `e2e-admin-${tenantId}`,
        role: Role.ADMIN,
        scope: null,
        is_active: 1,
      },
      { issuer, expiresIn: '5m' },
    );
    viewerToken = jwt.sign(
      {
        ...base,
        username: `e2e-viewer-${tenantId}`,
        role: Role.USER,
        scope: viewerScope,
        is_active: 1,
      },
      { issuer, expiresIn: '5m' },
    );
    expiredToken = jwt.sign(
      {
        ...base,
        username: `e2e-admin-${tenantId}`,
        role: Role.ADMIN,
        scope: null,
        is_active: 0,
        trial_started_at: '2020-01-01 00:00:00',
      },
      { issuer, expiresIn: '5m' },
    );
  });

  afterAll(async () => {
    await prisma.tenants.delete({ where: { id: tenantId } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('exige login', async () => {
    const res = await http().get('/api/v1/customers').expect(401);
    expect(res.body).toEqual({
      success: false,
      message: 'Login to access this area!',
    });
  });

  it('bloqueia assinatura vencida com 402', async () => {
    await http()
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(402);
  });

  it('valida campos obrigatórios com a mensagem do legado', async () => {
    const res = await http()
      .post('/api/v1/customers/add')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ name: 'Sem telefone' })
      .expect(400);
    expect(res.body.message).toBe(
      'Please provide required details: Name, Phone!',
    );
  });

  it('cadastra, lista, busca, atualiza e remove', async () => {
    const auth = { Cookie: `accessToken=${adminToken}` };

    await http()
      .post('/api/v1/customers/add')
      .set(auth)
      .send({
        phone,
        name: 'Maria Teste',
        birthDate: '1990-05-21',
        gender: 'female',
        isMember: true,
      })
      .expect(200, { success: true, message: `Customer: ${phone} added.` });

    await http()
      .post('/api/v1/customers/add')
      .set(auth)
      .send({ phone, name: 'Duplicado' })
      .expect(400);

    const list = await http()
      .get('/api/v1/customers?page=1&perPage=10&filter=Maria')
      .set(auth)
      .expect(200);
    expect(list.body.totalCustomers).toBe(1);
    expect(list.body.customers[0]).toMatchObject({
      phone,
      name: 'Maria Teste',
      birth_date: '1990-05-21',
      gender: 'female',
      is_member: 1,
    });
    expect(list.body.customers[0].created_at).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );

    const search = await http()
      .get('/api/v1/customers/search-by-phone-name/search?q=Teste')
      .set(auth)
      .expect(200);
    expect(search.body).toHaveLength(1);

    await http()
      .post(`/api/v1/customers/${phone}/update`)
      .set(auth)
      .send({ name: 'Maria Atualizada', email: 'maria@example.com' })
      .expect(200);

    const one = await http()
      .get(`/api/v1/customers/${phone}`)
      .set(auth)
      .expect(200);
    expect(one.body).toMatchObject({
      name: 'Maria Atualizada',
      email: 'maria@example.com',
      birth_date: null,
    });

    await http()
      .delete(`/api/v1/customers/${phone}/delete`)
      .set(auth)
      .expect(200);
    await http().get(`/api/v1/customers/${phone}`).set(auth).expect(404);
  });

  it('respeita os escopos do usuário', async () => {
    const auth = { Authorization: `Bearer ${viewerToken}` };
    await http().get('/api/v1/customers').set(auth).expect(200);
    const res = await http()
      .post('/api/v1/customers/add')
      .set(auth)
      .send({ phone: '1', name: 'x' })
      .expect(403);
    expect(res.body.message).toBe('Forbidden! Access Denied!');
  });
});
