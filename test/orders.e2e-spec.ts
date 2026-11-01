import type { INestApplication } from '@nestjs/common';
import { createTenant, createTestApp } from './support/app.js';

describe('POS, pedidos, cozinha e faturas (e2e)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let itemId: number;
  let addonId: number;
  let tableId: number;

  beforeAll(async () => {
    app = await createTestApp();
    t = await createTenant(app, 'e2e-orders');

    const tax = await t
      .post('/api/v1/settings/taxes/add')
      .send({ title: 'Taxa', rate: 10, type: 'exclusive' });
    const item = await t
      .post('/api/v1/menu-items/add')
      .send({ title: 'Pizza', price: 50, taxId: tax.body.taxId });
    itemId = item.body.menuItemId;
    const addon = await t
      .post(`/api/v1/menu-items/addons/${itemId}/add`)
      .send({ title: 'Borda', price: 5 });
    addonId = addon.body.addonId;
    const table = await t
      .post('/api/v1/settings/store-tables/add')
      .send({ title: 'M1', floor: '1', seatingCapacity: 4 });
    tableId = table.body.id;
    await t
      .post('/api/v1/settings/payment-types/add')
      .send({ title: 'Dinheiro', isActive: true });
    await t
      .post('/api/v1/customers/add')
      .send({ phone: '11911112222', name: 'Bia' });
  });

  afterAll(async () => {
    await t.cleanup();
    await app.close();
  });

  it('fluxo do POS até a fatura', async () => {
    const init = await t.get('/api/v1/pos/init').expect(200);
    expect(init.body.menuItems[0]).toMatchObject({
      id: itemId,
      addons: [{ id: addonId }],
    });
    expect(init.body.paymentTypes).toHaveLength(1);

    await t.post('/api/v1/pos/create-order').send({ cart: [] }).expect(400);

    const cart = [
      {
        id: itemId,
        price: 50,
        quantity: 2,
        notes: 'sem cebola',
        addons_ids: [addonId],
      },
    ];
    const first = await t
      .post('/api/v1/pos/create-order')
      .send({
        cart,
        deliveryType: 'dinein',
        customerType: 'CUSTOMER',
        customerId: { phone: '11911112222' },
        tableId,
      })
      .expect(200);
    expect(first.body).toMatchObject({ success: true, tokenNo: 1 });

    const second = await t
      .post('/api/v1/pos/create-order')
      .send({
        cart: [{ id: itemId, price: 50, quantity: 1 }],
        deliveryType: 'dinein',
        customerType: 'WALKIN',
        tableId,
      })
      .expect(200);
    expect(second.body.tokenNo).toBe(2);

    const kitchen = await t.get('/api/v1/kitchen').expect(200);
    expect(kitchen.body).toHaveLength(2);
    const firstOrder = kitchen.body.find(
      (o: { id: number }) => o.id === first.body.orderId,
    );
    expect(firstOrder).toMatchObject({
      customer_name: 'Bia',
      table_title: 'M1',
      token_no: 1,
    });
    expect(firstOrder.items[0]).toMatchObject({
      item_title: 'Pizza',
      quantity: 2,
      addons: [{ id: addonId, title: 'Borda' }],
    });
    expect(firstOrder.items[0].price).toBeUndefined();

    await t
      .post(`/api/v1/kitchen/${firstOrder.items[0].id}`)
      .send({ status: 'preparing' })
      .expect(200);

    const grouped = await t.get('/api/v1/orders').expect(200);
    expect(grouped.body).toHaveLength(1);
    expect(grouped.body[0].order_ids.sort()).toEqual(
      [first.body.orderId, second.body.orderId].sort(),
    );

    const orderIds = grouped.body[0].order_ids;
    const summary = await t
      .post('/api/v1/orders/complete-order-payment-summary')
      .send({ orderIds })
      .expect(200);
    // 3 pizzas (150) + 10% (15) + 2 bordas (10)
    expect(summary.body).toMatchObject({
      subtotal: 160,
      taxTotal: 15,
      total: 175,
    });

    await t
      .post('/api/v1/orders/complete-and-pay-order')
      .send({ orderIds, subTotal: 160, taxTotal: 15, total: 175 })
      .expect(200);
    expect((await t.get('/api/v1/orders').expect(200)).body).toEqual([]);

    const paid = await t
      .post('/api/v1/pos/create-order-and-invoice')
      .send({
        cart: [{ id: itemId, price: 50, quantity: 1 }],
        deliveryType: 'takeaway',
        netTotal: 50,
        taxTotal: 5,
        total: 55,
      })
      .expect(200);
    expect(paid.body).toMatchObject({ tokenNo: 3, invoiceId: 2 });

    const invoices = await t.get('/api/v1/invoices?type=today').expect(200);
    expect(invoices.body).toHaveLength(2);
    const firstInvoice = invoices.body.find(
      (i: { invoice_id: number }) => i.invoice_id === 1,
    );
    expect(firstInvoice).toMatchObject({ total: '175.00', table_title: 'M1' });
    expect(firstInvoice.orders).toHaveLength(2);

    const details = await t
      .post('/api/v1/invoices/orders')
      .send({ orderIds })
      .expect(200);
    expect(details.body.total).toBe(175);

    const search = await t.get('/api/v1/invoices/search?q=Bia').expect(200);
    expect(search.body[0].invoice_id).toBe(1);
  });

  it('pedidos via QR code no POS', async () => {
    const qr = await t.prisma.qr_orders.create({
      data: {
        tenant_id: t.tenantId,
        delivery_type: 'dinein',
        table_id: tableId,
      },
    });
    await t.prisma.qr_order_items.create({
      data: {
        order_id: qr.id,
        item_id: itemId,
        price: 50,
        quantity: 1,
        tenant_id: t.tenantId,
      },
    });

    expect(
      (await t.get('/api/v1/pos/qrorders/count').expect(200)).body,
    ).toEqual({ status: true, totalQROrders: 1 });
    const list = await t.get('/api/v1/pos/qrorders').expect(200);
    expect(list.body[0]).toMatchObject({
      id: qr.id,
      table_title: 'M1',
      items: [{ item_title: 'Pizza', tax_rate: 10 }],
    });

    await t
      .post('/api/v1/pos/create-order')
      .send({
        cart: [{ id: itemId, price: 50, quantity: 1 }],
        selectedQrOrderItem: qr.id,
      })
      .expect(200);
    expect((await t.get('/api/v1/pos/qrorders/count')).body.totalQROrders).toBe(
      0,
    );

    await t
      .post(`/api/v1/pos/qrorders/update-status/${qr.id}`)
      .send({ status: 'created' })
      .expect(200);
    await t.post('/api/v1/pos/qrorders/cancel-all').expect(200);
    expect((await t.get('/api/v1/pos/qrorders/count')).body.totalQROrders).toBe(
      0,
    );
  });
});
