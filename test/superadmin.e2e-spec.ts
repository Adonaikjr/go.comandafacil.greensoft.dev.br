import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTenant, createTestApp } from './support/app.js';

describe('Superadmin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-superadmin-${Date.now()}@example.com`;
  const tenantEmail = `e2e-sa-tenant-${Date.now()}@example.com`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.superadmins.create({
      data: { email, password: await bcrypt.hash('segredo', 4), name: 'Root' },
    });
  });

  afterAll(async () => {
    await prisma.superadmins.delete({ where: { email } });
    await prisma.refresh_tokens.deleteMany({ where: { username: email } });
    await prisma.page_visitors.deleteMany({ where: { referrer: 'e2e' } });
    await app.close();
  });

  it('login, painel, gestão de tenants e visitantes', async () => {
    const http = () => request(app.getHttpServer());
    await http()
      .post('/api/v1/superadmin/signin')
      .send({ username: email, password: 'x' })
      .expect(401);
    const login = await http()
      .post('/api/v1/superadmin/signin')
      .send({ username: email, password: 'segredo' })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    // Token de tenant não acessa o painel
    const tenant = await createTenant(app, 'e2e-sa');
    await http()
      .get('/api/v1/superadmin/dashboard')
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(401);
    await tenant.cleanup();

    const dashboard = await http()
      .get('/api/v1/superadmin/dashboard')
      .set(auth)
      .expect(200);
    expect(dashboard.body).toMatchObject({
      activeTenants: expect.any(Number),
      ordersProcessedToday: expect.any(Number),
    });

    await http()
      .post('/api/v1/superadmin/tenants/add')
      .set(auth)
      .send({
        name: 'e2e-sa-tenant',
        email: tenantEmail,
        password: '123',
        isActive: true,
      })
      .expect(200);
    await http()
      .post('/api/v1/superadmin/tenants/add')
      .set(auth)
      .send({ name: 'dup', email: tenantEmail, password: '123' })
      .expect(409);

    const list = await http()
      .get(`/api/v1/superadmin/tenants?search=${tenantEmail}`)
      .set(auth)
      .expect(200);
    expect(list.body.tenants).toHaveLength(1);
    const id = list.body.tenants[0].id;
    expect(list.body.tenants[0]).toMatchObject({
      name: 'e2e-sa-tenant',
      email: tenantEmail,
      is_active: 1,
    });

    await http()
      .patch(`/api/v1/superadmin/tenants/update/${id}`)
      .set(auth)
      .send({ name: 'e2e-sa-renomeado', email: tenantEmail, isActive: 0 })
      .expect(200);
    const details = await http()
      .get(`/api/v1/superadmin/tenants/${id}/subscription-history`)
      .set(auth)
      .expect(200);
    expect(details.body).toMatchObject({
      tenantInfo: { name: 'e2e-sa-renomeado', is_active: 0 },
      totalUsers: 1,
    });

    await http()
      .get('/api/v1/superadmin/tenantsData/bogus')
      .set(auth)
      .expect(400);
    await http()
      .get('/api/v1/superadmin/reports?type=this_month')
      .set(auth)
      .expect(200);
    await http()
      .delete(`/api/v1/superadmin/tenants/delete/${id}`)
      .set(auth)
      .expect(200);
    await http()
      .delete(`/api/v1/superadmin/tenants/delete/${id}`)
      .set(auth)
      .expect(404);

    await http()
      .post('/api/v1/superadmin/visitors/log')
      .send({ page: 'sales', referrer: 'e2e' })
      .expect(200);
    const visitors = await http()
      .get('/api/v1/superadmin/visitors?search=e2e')
      .set(auth)
      .expect(200);
    expect(visitors.body.total).toBeGreaterThanOrEqual(1);
    expect(visitors.body.stats.today).toBeGreaterThanOrEqual(1);

    const cookies = ([] as string[]).concat(login.headers['set-cookie']);
    const refresh = cookies
      .find((c) => c.startsWith('refreshToken='))!
      .split(';')[0];
    await http()
      .post('/api/v1/superadmin/refresh-token')
      .set('Cookie', refresh)
      .expect(200);
    await http()
      .post('/api/v1/superadmin/signout')
      .set('Cookie', refresh)
      .expect(200);
  });
});
