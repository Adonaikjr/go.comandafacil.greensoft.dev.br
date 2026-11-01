import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import bcrypt from 'bcrypt';
import Stripe from 'stripe';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { BillingService } from '../src/modules/billing/billing.service.js';
import { QUEUE } from '../src/modules/queues/queue-names.js';
import { createTestApp } from './support/app.js';

const waitFor = async (check: () => Promise<boolean>, timeout = 30_000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('timeout');
};

describe('Filas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-queues-${Date.now()}@example.com`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.superadmins.create({
      data: { email, password: await bcrypt.hash('x', 4), name: 'Q' },
    });
  });

  afterAll(async () => {
    await prisma.refresh_tokens.deleteMany({ where: { username: email } });
    await prisma.superadmins.delete({ where: { email } });
    await app.close();
  });

  it('webhook do Stripe valida a assinatura, enfileira e processa uma única vez', async () => {
    const handled: string[] = [];
    app.get(BillingService).handleEvent = async (event) => {
      handled.push(event.id);
    };

    const eventId = `evt_e2e_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'customer.subscription.updated',
      data: { object: {} },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
    const send = (signature: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/stripe-webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

    await send('t=1,v1=assinatura-falsa').expect(400);
    await send(header).expect(200);
    await send(header).expect(200); // reenvio do Stripe

    await waitFor(async () => handled.length > 0);
    await new Promise((r) => setTimeout(r, 1000));
    expect(handled).toEqual([eventId]);

    const queue = app.get<Queue>(getQueueToken(QUEUE.STRIPE));
    await queue.remove(eventId);
  });

  it('job de manutenção remove tokens expirados', async () => {
    await prisma.refresh_tokens.create({
      data: {
        username: email,
        refresh_token: 'expirado',
        expiry: new Date('2020-01-01T00:00:00Z'),
      },
    });
    const queue = app.get<Queue>(getQueueToken(QUEUE.MAINTENANCE));
    const job = await queue.add('cleanup', {});
    await waitFor(
      async () => (await job.isCompleted()) || (await job.isFailed()),
    );
    expect(await job.isCompleted()).toBe(true);
    expect(
      await prisma.refresh_tokens.count({
        where: { refresh_token: 'expirado' },
      }),
    ).toBe(0);
  });

  it('painel /admin/queues exige superadmin ou basic auth', async () => {
    const http = () => request(app.getHttpServer());
    await http().get('/admin/queues').expect(401);
    const login = await http()
      .post('/api/v1/superadmin/signin')
      .send({ username: email, password: 'x' });
    const res = await http()
      .get('/admin/queues')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect([200, 301, 302]).toContain(res.status);
  });
});
