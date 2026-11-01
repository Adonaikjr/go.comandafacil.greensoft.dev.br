import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTenant, createTestApp } from './support/app.js';

describe('Dashboard, relatórios e cardápio digital (e2e)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let itemId: number;

  beforeAll(async () => {
    app = await createTestApp();
    t = await createTenant(app, 'e2e-reports');
    const item = await t
      .post('/api/v1/menu-items/add')
      .send({ title: 'Suco', price: 8 });
    itemId = item.body.menuItemId;
  });

  afterAll(async () => {
    await t.cleanup();
    await app.close();
  });

  it('cardápio digital: abre pelo código e faz pedido', async () => {
    const http = request(app.getHttpServer());
    await http.get('/api/v1/qrmenu/nao-existe').expect(404);

    await t
      .post('/api/v1/settings/store-setting')
      .send({ storeName: 'Loja QR', isQRMenuEnabled: true });
    const table = await t
      .post('/api/v1/settings/store-tables/add')
      .send({ title: 'M9', floor: '1', seatingCapacity: 2 });
    const tables = await t.get('/api/v1/settings/store-tables');
    const encrypted = tables.body.find(
      (tb: { id: number }) => tb.id === table.body.id,
    ).encrypted_id;
    const { uniqueQRCode } = (await t.get('/api/v1/settings/store-setting'))
      .body;

    const menu = await http
      .get(`/api/v1/qrmenu/${uniqueQRCode}?tableId=${encrypted}`)
      .expect(200);
    expect(menu.body.storeSettings.store_name).toBe('Loja QR');
    expect(menu.body.storeTable).toMatchObject({
      id: table.body.id,
      table_title: 'M9',
    });
    expect(menu.body.menuItems[0].id).toBe(itemId);

    await http
      .post(`/api/v1/qrmenu/${uniqueQRCode}/place-order`)
      .send({
        cartItems: [{ id: itemId, price: 8, quantity: 3 }],
        customerType: 'CUSTOMER',
        customer: { phone: '11900001111', name: 'Leo' },
        tableId: table.body.id,
      })
      .expect(200);

    expect((await t.get('/api/v1/pos/qrorders/count')).body.totalQROrders).toBe(
      1,
    );
    const customer = await t.get('/api/v1/customers/11900001111').expect(200);
    expect(customer.body.name).toBe('Leo');
  });

  it('dashboard e relatórios', async () => {
    await t
      .post('/api/v1/pos/create-order-and-invoice')
      .send({
        cart: [{ id: itemId, price: 8, quantity: 2 }],
        customerType: 'WALKIN',
        netTotal: 16,
        taxTotal: 0,
        total: 16,
      })
      .expect(200);

    const dashboard = await t.get('/api/v1/dashboard').expect(200);
    expect(dashboard.body).toMatchObject({
      ordersCount: 1,
      newCustomerCount: 1,
      repeatedCustomerCount: 0,
    });
    expect(dashboard.body.topSellingItems[0]).toMatchObject({
      id: itemId,
      orders_count: 2,
    });

    await t.get('/api/v1/reports').expect(400);
    const reports = await t.get('/api/v1/reports?type=today').expect(200);
    expect(reports.body).toMatchObject({
      ordersCount: 1,
      totalCustomers: 1,
      revenueTotal: '16.00',
      netRevenue: '16.00',
    });
    const lastMonth = await t
      .get('/api/v1/reports?type=last_month')
      .expect(200);
    expect(lastMonth.body.ordersCount).toBe(0);
  });
});
