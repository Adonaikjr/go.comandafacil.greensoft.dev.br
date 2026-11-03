import type { INestApplication } from '@nestjs/common';
import { createTenant, createTestApp } from './support/app.js';

describe('Cancelamento de assinatura (e2e)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;

  beforeAll(async () => {
    app = await createTestApp();
    t = await createTenant(app, 'e2e-billing');
  });

  afterAll(async () => {
    await t.cleanup();
    await app.close();
  });

  // As duas recusas acontecem antes de chamar o Stripe.
  it('sem assinatura não há o que cancelar', async () => {
    await t
      .post('/api/v1/auth/cancel-subscription')
      .send({ id: 'sub_qualquer' })
      .expect(400);
  });

  it('não cancela a assinatura de outra loja', async () => {
    await t.prisma.tenants.update({
      where: { id: t.tenantId },
      data: { subscription_id: 'sub_desta_loja' },
    });
    await t
      .post('/api/v1/auth/cancel-subscription')
      .send({ id: 'sub_de_outra_loja' })
      .expect(403);
  });
});
