import type { INestApplication } from '@nestjs/common';
import { createTenant, createTestApp } from './support/app.js';

// Simula a API do iFood interceptando fetch
function mockIfoodApi() {
  const calls: { url: string; method: string; body?: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body?.toString(),
    });
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), { status: 200 });
    if (url.includes('/oauth/token'))
      return json({ accessToken: 'tok', expiresIn: 3600 });
    if (url.includes('events:polling'))
      return json([{ id: 'evt-1', orderId: 'ord-1' }]);
    if (url.endsWith('/orders/ord-1')) {
      return json({
        id: 'ord-1',
        orderStatus: 'PLACED',
        totalPrice: 42.5,
        customer: { name: 'Cliente X' },
      });
    }
    if (
      url.includes('acknowledgment') ||
      url.includes('/confirm') ||
      url.includes('/cancel')
    ) {
      return new Response(null, { status: 202 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = realFetch) };
}

describe('iFood / Keeta (e2e)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let api: ReturnType<typeof mockIfoodApi>;

  beforeAll(async () => {
    app = await createTestApp();
    t = await createTenant(app, 'e2e-delivery');
    api = mockIfoodApi();
  });

  afterAll(async () => {
    api.restore();
    await t.cleanup();
    await app.close();
  });

  it('credenciais, sincronização e mudança de status no iFood', async () => {
    expect((await t.get('/api/v1/ifood/credentials').expect(200)).body).toEqual(
      { configured: false },
    );
    await t
      .post('/api/v1/ifood/credentials')
      .send({ client_id: 'a' })
      .expect(400);
    await t
      .post('/api/v1/ifood/credentials')
      .send({ client_id: 'cid', client_secret: 'segredo', merchant_id: 'm-1' })
      .expect(200, { success: true });

    const stored = await t.prisma.ifood_credentials.findUnique({
      where: { tenant_id: t.tenantId },
    });
    expect(stored!.client_secret).toMatch(/^enc:/);
    expect((await t.get('/api/v1/ifood/credentials')).body).toEqual({
      configured: true,
      merchant_id: 'm-1',
      is_active: true,
    });

    const sync = await t.get('/api/v1/ifood/sync').expect(200);
    expect(sync.body).toMatchObject({
      synced: 1,
      orders: [{ ifoodOrderId: 'ord-1', status: 'PLACED' }],
    });
    expect(
      api.calls.some(
        (c) => c.url.includes('acknowledgment') && c.body?.includes('evt-1'),
      ),
    ).toBe(true);
    expect(
      api.calls.find((c) => c.url.includes('/oauth/token'))!.body,
    ).toContain('clientSecret=segredo');

    const list = await t.get('/api/v1/ifood').expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        ifood_order_id: 'ord-1',
        customer_name: 'Cliente X',
        total: '42.50',
        status: 'PLACED',
      }),
    ]);

    await t.post('/api/v1/ifood/confirm/ord-1').expect(200);
    expect((await t.get('/api/v1/ifood')).body[0].status).toBe('CONFIRMED');
    await t
      .post('/api/v1/ifood/cancel/ord-1')
      .send({ reason: 'X' })
      .expect(200);
    expect((await t.get('/api/v1/ifood')).body).toEqual([]);

    await t
      .get('/api/v1/ifood/detail/nao-existe')
      .expect(500, { success: false, message: 'Erro ao buscar pedido' });
  });

  it('Keeta usa restaurant_id', async () => {
    await t
      .post('/api/v1/keeta/credentials')
      .send({ client_id: 'k', client_secret: 's', restaurant_id: 'r-9' })
      .expect(200);
    expect((await t.get('/api/v1/keeta/credentials')).body).toEqual({
      configured: true,
      restaurant_id: 'r-9',
      is_active: true,
    });
    expect((await t.get('/api/v1/keeta').expect(200)).body).toEqual([]);
  });
});
