import type { INestApplication } from '@nestjs/common';
import { createTenant, createTestApp } from './support/app.js';

describe('Estoque (e2e)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let menuItemId: number;

  beforeAll(async () => {
    app = await createTestApp();
    t = await createTenant(app, 'e2e-inventory');
    const item = await t
      .post('/api/v1/menu-items/add')
      .send({ title: 'Refrigerante', price: 6 });
    menuItemId = item.body.menuItemId;
  });

  afterAll(async () => {
    await t.cleanup();
    await app.close();
  });

  it('cadastro, movimentações manuais e validações', async () => {
    await t.post('/api/v1/inventory/add').send({}).expect(400);

    const created = await t
      .post('/api/v1/inventory/add')
      .send({ title: 'Farinha', unit: 'kg', minQuantity: 5, quantity: 10.5 })
      .expect(200);
    const id = created.body.inventoryItemId;

    await t
      .post(`/api/v1/inventory/${id}/movement`)
      .send({ type: 'entry', quantity: 2 })
      .expect(200);
    await t
      .post(`/api/v1/inventory/${id}/movement`)
      .send({ type: 'exit', quantity: 100 })
      .expect(400);
    const exit = await t
      .post(`/api/v1/inventory/${id}/movement`)
      .send({ type: 'exit', quantity: 8.25, notes: 'perda' })
      .expect(200);
    expect(Number(exit.body.quantity)).toBe(4.25);

    const item = await t.get(`/api/v1/inventory/${id}`).expect(200);
    expect(item.body).toMatchObject({
      title: 'Farinha',
      unit: 'kg',
      low_stock: true,
    });
    expect(Number(item.body.quantity)).toBe(4.25);

    await t
      .post(`/api/v1/inventory/${id}/movement`)
      .send({ type: 'adjustment', quantity: 20 })
      .expect(200);
    const low = await t.get('/api/v1/inventory?lowStock=true').expect(200);
    expect(low.body).toEqual([]);

    const history = await t
      .get(`/api/v1/inventory/movements?itemId=${id}`)
      .expect(200);
    expect(history.body.totalMovements).toBe(4);
    expect(history.body.movements.map((m: { type: string }) => m.type)).toEqual(
      ['adjustment', 'exit', 'entry', 'entry'],
    );
    expect(Number(history.body.movements[0].quantity)).toBe(15.75);
    expect(Number(history.body.movements[0].balance)).toBe(20);

    await t.delete(`/api/v1/inventory/delete/${id}`).expect(200);
    await t.get(`/api/v1/inventory/${id}`).expect(404);
  });

  it('venda baixa e cancelamento devolve o estoque do produto', async () => {
    const created = await t
      .post('/api/v1/inventory/add')
      .send({ title: 'Lata 350ml', menuItemId, quantity: 24 })
      .expect(200);
    const id = created.body.inventoryItemId;

    // Um produto só pode ter um item de estoque
    await t
      .post('/api/v1/inventory/add')
      .send({ title: 'Outro', menuItemId })
      .expect(400);

    const order = await t
      .post('/api/v1/pos/create-order')
      .send({
        cart: [
          { id: menuItemId, price: 6, quantity: 3 },
          { id: menuItemId, price: 6, quantity: 2, notes: 'gelada' },
        ],
        deliveryType: 'takeaway',
      })
      .expect(200);

    let item = await t.get(`/api/v1/inventory/${id}`).expect(200);
    expect(Number(item.body.quantity)).toBe(19);

    const orderIds = [order.body.orderId];
    await t.post('/api/v1/orders/cancel').send({ orderIds }).expect(200);
    // Cancelar de novo não devolve duas vezes
    await t.post('/api/v1/orders/cancel').send({ orderIds }).expect(200);

    item = await t.get(`/api/v1/inventory/${id}`).expect(200);
    expect(Number(item.body.quantity)).toBe(24);

    const sales = await t
      .get(`/api/v1/inventory/movements?itemId=${id}&type=sale`)
      .expect(200);
    expect(sales.body.movements[0].order_id).toBe(order.body.orderId);
    expect(Number(sales.body.movements[0].quantity)).toBe(-5);
  });
});
