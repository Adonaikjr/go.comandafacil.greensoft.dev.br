import type { INestApplication } from '@nestjs/common';
import { createTenant, createTestApp } from './support/app.js';

describe('Settings (e2e)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;

  beforeAll(async () => {
    app = await createTestApp();
    t = await createTenant(app, 'e2e-settings');
  });

  afterAll(async () => {
    await t.cleanup();
    await app.close();
  });

  it('salva e lê dados da loja, mantendo o código do QR', async () => {
    await t
      .post('/api/v1/settings/store-setting')
      .send({ storeName: 'Loja', currency: 'BRL', isQRMenuEnabled: true })
      .expect(200, { success: true, message: 'Details Saved Successfully.' });
    const first = await t.get('/api/v1/settings/store-setting').expect(200);
    expect(first.body).toMatchObject({
      storeName: 'Loja',
      currency: 'BRL',
      isQRMenuEnabled: true,
    });
    expect(first.body.uniqueQRCode).toEqual(expect.any(String));

    await t
      .post('/api/v1/settings/store-setting')
      .send({ storeName: 'Loja 2' })
      .expect(200);
    const second = await t.get('/api/v1/settings/store-setting').expect(200);
    expect(second.body.storeName).toBe('Loja 2');
    expect(second.body.uniqueQRCode).toBe(first.body.uniqueQRCode);
  });

  it('escolhe o template do cardápio e mantém quando o campo não vem', async () => {
    const before = await t.get('/api/v1/settings/store-setting').expect(200);
    expect(before.body.qrMenuTemplate).toEqual(expect.any(String));

    await t
      .post('/api/v1/settings/store-setting')
      .send({ storeName: 'Loja', qrMenuTemplate: 'inexistente' })
      .expect(400);
    await t
      .post('/api/v1/settings/store-setting')
      .send({ storeName: 'Loja', qrMenuTemplate: 'zen' })
      .expect(200);
    expect(
      (await t.get('/api/v1/settings/store-setting').expect(200)).body
        .qrMenuTemplate,
    ).toBe('zen');

    // PDV web salva sem o campo: nao pode voltar para o classico
    await t
      .post('/api/v1/settings/store-setting')
      .send({ storeName: 'Loja' })
      .expect(200);
    expect(
      (await t.get('/api/v1/settings/store-setting').expect(200)).body
        .qrMenuTemplate,
    ).toBe('zen');
  });

  it('configurações de impressão', async () => {
    await t
      .post('/api/v1/settings/print-setting')
      .send({ pageFormat: '80mm', showNotes: 1, printToken: false })
      .expect(200);
    const res = await t.get('/api/v1/settings/print-setting').expect(200);
    expect(res.body).toMatchObject({
      pageFormat: '80mm',
      showNotes: true,
      printToken: null,
    });
  });

  it('CRUD de impostos', async () => {
    await t
      .post('/api/v1/settings/taxes/add')
      .send({ title: 'ICMS' })
      .expect(400);
    const add = await t
      .post('/api/v1/settings/taxes/add')
      .send({ title: 'ICMS', rate: '12', type: 'exclusive' })
      .expect(200);
    const id = add.body.taxId;
    await t
      .post(`/api/v1/settings/taxes/${id}/update`)
      .send({ title: 'ICMS', rate: 18, type: 'inclusive' })
      .expect(200);
    const one = await t.get(`/api/v1/settings/taxes/${id}`).expect(200);
    expect(one.body).toEqual([
      { id, title: 'ICMS', rate: 18, type: 'inclusive' },
    ]);
    await t.delete(`/api/v1/settings/taxes/${id}`).expect(200);
    expect((await t.get('/api/v1/settings/taxes').expect(200)).body).toEqual(
      [],
    );
  });

  it('formas de pagamento', async () => {
    const add = await t
      .post('/api/v1/settings/payment-types/add')
      .send({ title: 'Pix', isActive: true })
      .expect(200);
    await t
      .post(`/api/v1/settings/payment-types/${add.body.id}/toggle`)
      .send({ isActive: false })
      .expect(200);
    const list = await t.get('/api/v1/settings/payment-types').expect(200);
    expect(list.body).toEqual([
      { id: add.body.id, title: 'Pix', is_active: false },
    ]);
  });

  it('mesas com id criptografado', async () => {
    await t
      .post('/api/v1/settings/store-tables/add')
      .send({ title: 'Mesa 1', floor: 'Térreo', seatingCapacity: -1 })
      .expect(400);
    const add = await t
      .post('/api/v1/settings/store-tables/add')
      .send({ title: 'Mesa 1', floor: 'Térreo', seatingCapacity: 4 })
      .expect(200);
    const list = await t.get('/api/v1/settings/store-tables').expect(200);
    expect(list.body[0]).toMatchObject({
      id: add.body.id,
      table_title: 'Mesa 1',
      seating_capacity: 4,
    });
    expect(list.body[0].encrypted_id).toMatch(/^[0-9A-F]+$/);
  });

  it('categorias', async () => {
    const add = await t
      .post('/api/v1/settings/categories/add')
      .send({ title: 'Bebidas' })
      .expect(200);
    await t
      .post(`/api/v1/settings/categories/${add.body.id}/update`)
      .send({ title: 'Drinks' })
      .expect(200);
    const list = await t.get('/api/v1/settings/categories').expect(200);
    expect(list.body).toEqual([{ id: add.body.id, title: 'Drinks' }]);
  });
});
