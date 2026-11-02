import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import { createTenant, createTestApp } from './support/app.js';

describe('Menu items (e2e)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;

  beforeAll(async () => {
    app = await createTestApp();
    t = await createTenant(app, 'e2e-menu');
  });

  afterAll(async () => {
    await t.cleanup();
    await app.close();
  });

  it('item com imposto, categoria, adicionais, variações e foto', async () => {
    const tax = await t
      .post('/api/v1/settings/taxes/add')
      .send({ title: 'ISS', rate: 5, type: 'exclusive' });
    const cat = await t
      .post('/api/v1/settings/categories/add')
      .send({ title: 'Lanches' });

    await t.post('/api/v1/menu-items/add').send({ title: 'X' }).expect(400, {
      success: false,
      message: 'Please provide required details: title, price',
    });

    const add = await t
      .post('/api/v1/menu-items/add')
      .send({
        title: 'X-Burger',
        price: '25.5',
        taxId: tax.body.taxId,
        categoryId: cat.body.id,
      })
      .expect(200);
    const id = add.body.menuItemId;

    const addon = await t
      .post(`/api/v1/menu-items/addons/${id}/add`)
      .send({ title: 'Bacon', price: 4 })
      .expect(200);
    await t
      .post(`/api/v1/menu-items/variants/${id}/add`)
      .send({ title: 'Duplo', price: '32.00' })
      .expect(200);
    await t
      .post(`/api/v1/menu-items/addons/${id}/update/${addon.body.addonId}`)
      .send({ title: 'Bacon extra', price: 5 })
      .expect(200);

    const all = await t.get('/api/v1/menu-items').expect(200);
    expect(all.body).toHaveLength(1);
    expect(all.body[0]).toMatchObject({
      id,
      title: 'X-Burger',
      price: '25.50',
      tax_title: 'ISS',
      tax_rate: 5,
      category_title: 'Lanches',
      addons: [{ title: 'Bacon extra', price: '5.00', item_id: id }],
      variants: [{ title: 'Duplo', price: '32.00' }],
    });

    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#0a0' },
    })
      .png()
      .toBuffer();
    const upload = await t
      .post(`/api/v1/menu-items/update/${id}/upload-photo`)
      .attach('image', png, 'foto.png')
      .expect(200);
    expect(upload.body.imageURL).toBe(`/public/${t.tenantId}/${id}.webp`);
    await request(app.getHttpServer())
      .get(upload.body.imageURL)
      .expect(200)
      .expect('content-type', 'image/webp');

    const invalid = await t
      .post(`/api/v1/menu-items/update/${id}/upload-photo`)
      .attach('image', Buffer.from('isto nao e uma imagem'), 'foto.jpg')
      .expect(400);
    expect(invalid.body.message).toContain('JPG, PNG ou WEBP');

    await t.post(`/api/v1/menu-items/update/${id}/remove-photo`).expect(200);
    expect(
      (await t.get(`/api/v1/menu-items/${id}`).expect(200)).body.image,
    ).toBeNull();

    await t.delete(`/api/v1/menu-items/delete/${id}`).expect(200);
    expect((await t.get('/api/v1/menu-items').expect(200)).body).toEqual([]);
  });
});
