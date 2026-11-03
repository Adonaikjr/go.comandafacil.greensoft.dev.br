import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createTenant, createTestApp } from './support/app.js';

describe('Exclusão de conta (e2e)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let deleted = false;

  beforeAll(async () => {
    app = await createTestApp();
    t = await createTenant(app, 'e2e-account');
    await t.prisma.users.update({
      where: { username: t.username },
      data: { password: await bcrypt.hash('senha-certa', 4) },
    });
  });

  afterAll(async () => {
    if (!deleted) await t.cleanup();
    await app.close();
  });

  it('exige a confirmação e a senha', async () => {
    await t
      .post('/api/v1/account/delete')
      .send({ password: 'senha-certa' })
      .expect(400);
    const wrong = await t
      .post('/api/v1/account/delete')
      .send({ confirm: 'EXCLUIR', password: 'errada' })
      .expect(400);
    expect(wrong.body.message).toBe('Senha incorreta.');
    expect(await t.prisma.tenants.count({ where: { id: t.tenantId } })).toBe(1);
  });

  it('apaga a loja inteira, inclusive pedidos do QR', async () => {
    const item = await t
      .post('/api/v1/menu-items/add')
      .send({ title: 'Café', price: 5 });
    await t
      .post('/api/v1/settings/store-setting')
      .send({ storeName: 'Loja Excluir', isQRMenuEnabled: true });
    const { uniqueQRCode } = (await t.get('/api/v1/settings/store-setting'))
      .body;
    await request(app.getHttpServer())
      .post(`/api/v1/qrmenu/${uniqueQRCode}/place-order`)
      .send({
        cartItems: [{ id: item.body.menuItemId, price: 5, quantity: 1 }],
      })
      .expect(200);

    await t
      .post('/api/v1/account/delete')
      .send({ confirm: 'EXCLUIR', password: 'senha-certa' })
      .expect(200);
    deleted = true;

    const where = { tenant_id: t.tenantId };
    expect(await t.prisma.tenants.count({ where: { id: t.tenantId } })).toBe(0);
    expect(await t.prisma.users.count({ where })).toBe(0);
    expect(await t.prisma.qr_orders.count({ where })).toBe(0);
    expect(await t.prisma.menu_items.count({ where })).toBe(0);
  });
});
