import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { createTenant, createTestApp } from './support/app.js';

describe('Push do pedido pelo QR (e2e)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let itemId: number;
  const token = 'ExponentPushToken[e2e-push-token]';

  // Intercepta só a chamada ao Expo; o resto (supertest, banco) segue normal.
  const realFetch = globalThis.fetch;
  const expoCalls: { url: string; body: unknown }[] = [];

  beforeAll(async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.startsWith('https://exp.host/')) return realFetch(input, init);
      const body = JSON.parse(String(init?.body)) as { to: string }[];
      expoCalls.push({ url, body });
      return new Response(
        JSON.stringify({
          data: body.map(() => ({
            status: 'error',
            details: { error: 'DeviceNotRegistered' },
          })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    app = await createTestApp();
    t = await createTenant(app, 'e2e-push');
    const item = await t
      .post('/api/v1/menu-items/add')
      .send({ title: 'Café', price: 5 });
    itemId = item.body.menuItemId;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await t.cleanup();
    await app.close();
  });

  it('recusa token que não é do Expo', async () => {
    await t
      .post('/api/v1/push/register')
      .send({ token: 'qualquer-coisa' })
      .expect(400);
  });

  it('pedido pelo QR avisa o aparelho registrado e limpa token morto', async () => {
    await t
      .post('/api/v1/push/register')
      .send({ token, platform: 'android' })
      .expect(200);

    await t
      .post('/api/v1/settings/store-setting')
      .send({ storeName: 'Loja Push', isQRMenuEnabled: true });
    const table = await t
      .post('/api/v1/settings/store-tables/add')
      .send({ title: '7', floor: '1', seatingCapacity: 2 });
    const { uniqueQRCode } = (await t.get('/api/v1/settings/store-setting'))
      .body;

    await request(app.getHttpServer())
      .post(`/api/v1/qrmenu/${uniqueQRCode}/place-order`)
      .send({
        cartItems: [{ id: itemId, price: 5, quantity: 1 }],
        tableId: table.body.id,
      })
      .expect(200);

    // O push sai sem bloquear a resposta: espera ele terminar.
    await vi.waitFor(async () => {
      expect(await t.prisma.push_tokens.count({ where: { token } })).toBe(0);
    });
    expect(expoCalls).toHaveLength(1);
    expect(expoCalls[0].body).toEqual([
      expect.objectContaining({
        to: token,
        title: 'Pedido pelo QR',
        body: 'Mesa 7 pediu pelo cardápio. Toque para aceitar.',
        data: { url: '/qrorders' },
      }),
    ]);
  });

  it('unregister tira o aparelho', async () => {
    await t.post('/api/v1/push/register').send({ token }).expect(200);
    await t.post('/api/v1/push/unregister').send({ token }).expect(200);
    expect(await t.prisma.push_tokens.count({ where: { token } })).toBe(0);
  });
});
