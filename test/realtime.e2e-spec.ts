import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { createTenant, createTestApp } from './support/app.js';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';

const connect = (url: string, auth?: { token: string }) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = io(url, { auth, transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

const next = <T = unknown>(socket: Socket, event: string, timeout = 15_000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout esperando ${event}`)),
      timeout,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ConfigModule lê o env na importação; troca as flags direto nos services
function setRealtimeFlags(
  app: INestApplication,
  flags: { legacyAuth: boolean; serverEvents: boolean },
) {
  Object.defineProperty(app.get(RealtimeService), 'serverEventsEnabled', {
    get: () => flags.serverEvents,
  });
  const config = app.get(ConfigService);
  const original = config.get.bind(config);
  vi.spyOn(config, 'get').mockImplementation(((key: string, ...rest: []) =>
    key === 'SOCKET_LEGACY_AUTH'
      ? flags.legacyAuth
      : original(key, ...rest)) as typeof config.get);
}

async function listen(app: INestApplication) {
  await app.listen(0);
  return `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
}

describe('Socket.IO (e2e)', () => {
  describe('modo compatível com o legado (eventos repassados pelo frontend)', () => {
    let app: INestApplication;
    let url: string;
    const sockets: Socket[] = [];

    beforeAll(async () => {
      app = await createTestApp();
      setRealtimeFlags(app, { legacyAuth: true, serverEvents: false });
      url = await listen(app);
    });

    afterAll(async () => {
      sockets.forEach((s) => s.disconnect());
      await app.close();
    });

    it('authenticate(tenantId) + new_order_backend/order_update_backend', async () => {
      const kitchen = await connect(url);
      const pos = await connect(url);
      sockets.push(kitchen, pos);
      kitchen.emit('authenticate', 999001);
      pos.emit('authenticate', 999001);
      await sleep(300);

      const received = next(kitchen, 'new_order');
      pos.emit('new_order_backend', { tokenNo: 7 }, 999001);
      expect(await received).toEqual({ tokenNo: 7 });

      const update = next(kitchen, 'order_update');
      pos.emit('order_update_backend', {}, 999001);
      await update;
    });

    it('cliente com token entra na sala do próprio tenant automaticamente', async () => {
      const t = await createTenant(app, 'e2e-socket');
      try {
        const kitchen = await connect(url, { token: t.token });
        const other = await connect(url);
        sockets.push(kitchen, other);
        await sleep(300);

        const received = next(kitchen, 'new_order');
        other.emit('new_order_backend', { tokenNo: 1 }, t.tenantId);
        expect(await received).toEqual({ tokenNo: 1 });
      } finally {
        await t.cleanup();
      }
    });
  });

  describe('REALTIME_SERVER_EVENTS=true (backend emite os eventos)', () => {
    let app: INestApplication;
    let url: string;
    let socket: Socket | undefined;

    beforeAll(async () => {
      app = await createTestApp();
      setRealtimeFlags(app, { legacyAuth: false, serverEvents: true });
      url = await listen(app);
    });

    afterAll(async () => {
      socket?.disconnect();
      await app.close();
    });

    it('POS cria pedido → cozinha recebe new_order do servidor', async () => {
      const t = await createTenant(app, 'e2e-socket-server');
      try {
        const item = await t
          .post('/api/v1/menu-items/add')
          .send({ title: 'Café', price: 5 });
        socket = await connect(url, { token: t.token });
        await sleep(300);

        const received = next<{ tokenNo: number; orderId: number }>(
          socket,
          'new_order',
        );
        await t
          .post('/api/v1/pos/create-order')
          .send({ cart: [{ id: item.body.menuItemId, price: 5, quantity: 1 }] })
          .expect(200);
        expect((await received).tokenNo).toBe(1);
      } finally {
        await t.cleanup();
      }
    });

    it('sem token, authenticate(tenantId) não entra na sala de ninguém', async () => {
      const t = await createTenant(app, 'e2e-socket-noauth');
      const intruder = await connect(url);
      try {
        intruder.emit('authenticate', t.tenantId);
        await sleep(300);
        const leaked = next(intruder, 'new_order', 2_000).then(
          () => true,
          () => false,
        );
        const item = await t
          .post('/api/v1/menu-items/add')
          .send({ title: 'Chá', price: 4 });
        await t
          .post('/api/v1/pos/create-order')
          .send({ cart: [{ id: item.body.menuItemId, price: 4, quantity: 1 }] })
          .expect(200);
        expect(await leaked).toBe(false);
      } finally {
        intruder.disconnect();
        await t.cleanup();
      }
    });
  });
});
