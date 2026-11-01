import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, sentMails } from './support/app.js';

const cookiesFrom = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []);
const cookieValue = (cookies: string[], name: string) =>
  cookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0];

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const username = `e2e-auth-${Date.now()}@example.com`;
  const password = 'senha-forte-123';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const user = await prisma.users.findUnique({ where: { username } });
    if (user?.tenant_id)
      await prisma.tenants.delete({ where: { id: user.tenant_id } });
    await prisma.reset_password_tokens.deleteMany({ where: { username } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('fluxo completo: cadastro, login, dispositivos, refresh, logout', async () => {
    await http()
      .post('/api/v1/auth/signup')
      .send({ biz_name: 'Restaurante E2E', username, password })
      .expect(200);

    await http()
      .post('/api/v1/auth/signup')
      .send({ biz_name: 'Outro', username, password })
      .expect(400);

    await http()
      .post('/api/v1/auth/signin')
      .send({ username, password: 'errada' })
      .expect(401, { success: false, message: 'E-mail ou senha inválidos!' });

    const login = await http()
      .post('/api/v1/auth/signin')
      .send({ username, password })
      .expect(200);

    expect(login.body.user).toMatchObject({
      username,
      name: 'Restaurante E2E',
      role: 'admin',
      is_active: 0,
      plan_type: 'basic',
    });
    expect(login.body.user.password).toBeUndefined();
    expect(login.body.user.trial_started_at).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );

    const cookies = cookiesFrom(login);
    const access = cookieValue(cookies, 'accessToken')!;
    const refresh = cookieValue(cookies, 'refreshToken')!;
    expect(cookies.some((c) => c.startsWith('pdv-green='))).toBe(true);

    const devices = await http()
      .get('/api/v1/auth/devices')
      .set('Cookie', [access, refresh])
      .expect(200);
    expect(devices.body).toHaveLength(1);
    expect(devices.body[0].isMyDevice).toBe(true);

    const refreshed = await http()
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', [refresh])
      .expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));

    // Trial recém-criado libera rotas protegidas por assinatura
    await http().get('/api/v1/customers').set('Cookie', [access]).expect(200);

    const details = await http()
      .get('/api/v1/auth/subscription-details')
      .set('Cookie', [access])
      .expect(200);
    expect(details.body).toMatchObject({ is_active: 0, subscription_id: null });

    await http()
      .post('/api/v1/auth/signout')
      .set('Cookie', [access, refresh])
      .expect(200);

    await http()
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', [refresh])
      .expect(401)
      .expect((res) => expect(res.body.loginNeeded).toBe(true));
  });

  it('redefine a senha com o token enviado por e-mail', async () => {
    await http()
      .post('/api/v1/auth/forgot-password')
      .send({ username })
      .expect(200);
    const mail = sentMails.find((m) => m.to === username)!;
    const token = /token=([a-f0-9]+)/.exec(mail.html)![1];

    await http()
      .post(`/api/v1/auth/reset-password/${token}`)
      .send({ password: 'nova-senha' })
      .expect(200);

    await http()
      .post(`/api/v1/auth/reset-password/${token}`)
      .send({ password: 'de-novo' })
      .expect(400);

    await http()
      .post('/api/v1/auth/signin')
      .send({ username, password: 'nova-senha' })
      .expect(200);
  });
});
