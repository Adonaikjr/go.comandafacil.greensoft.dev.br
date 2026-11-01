import type { INestApplication } from '@nestjs/common';
import { createTenant, createTestApp } from './support/app.js';

describe('Reservations & Users (e2e)', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;

  beforeAll(async () => {
    app = await createTestApp();
    t = await createTenant(app, 'e2e-res-users');
  });

  afterAll(async () => {
    await t.cleanup();
    await app.close();
  });

  it('reservas: cria, lista por período, busca, cancela e remove', async () => {
    await t
      .post('/api/v1/customers/add')
      .send({ phone: '11999990000', name: 'Ana' })
      .expect(200);
    const table = await t
      .post('/api/v1/settings/store-tables/add')
      .send({ title: 'M1', floor: '1', seatingCapacity: 2 });

    await t
      .post('/api/v1/reservations/add')
      .send({ customerId: '11999990000' })
      .expect(400);

    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });
    const add = await t
      .post('/api/v1/reservations/add')
      .send({
        customerId: '11999990000',
        date: `${today}T20:30`,
        tableId: table.body.id,
        peopleCount: 2,
        status: 'BOOKED',
      })
      .expect(200);
    expect(add.body.uniqueCode).toHaveLength(10);

    const list = await t.get('/api/v1/reservations?type=today').expect(200);
    expect(list.body[0]).toMatchObject({
      id: add.body.reservationId,
      customer_name: 'Ana',
      table_title: 'M1',
      date: `${today} 20:30:00`,
      people_count: 2,
    });

    await t.get('/api/v1/reservations?type=custom').expect(400);
    const found = await t
      .get(`/api/v1/reservations/search?q=${add.body.uniqueCode}`)
      .expect(200);
    expect(found.body).toHaveLength(1);

    await t
      .post(`/api/v1/reservations/cancel/${add.body.reservationId}`)
      .expect(200);
    const init = await t.get('/api/v1/reservations/init').expect(200);
    expect(init.body.storeTables).toHaveLength(1);

    await t
      .delete(`/api/v1/reservations/delete/${add.body.reservationId}`)
      .expect(200);
    await t
      .get(`/api/v1/reservations/search?q=${add.body.uniqueCode}`)
      .expect(404);
  });

  it('usuários: cria, atualiza, troca senha e remove', async () => {
    const username = `e2e-user-${t.tenantId}`;
    await t
      .post('/api/v1/users/add')
      .send({
        username,
        password: '123',
        name: 'Caixa',
        userScopes: ['INVALIDO'],
      })
      .expect(400, { success: false, message: 'Invalid Request!' });

    await t
      .post('/api/v1/users/add')
      .send({
        username,
        password: '123',
        name: 'Caixa',
        userScopes: ['PDV', 'PEDIDOS'],
      })
      .expect(200);

    await t
      .post(`/api/v1/users/update/${username}`)
      .send({ name: 'Caixa 2', userScopes: ['PDV'] })
      .expect(200);
    await t
      .post(`/api/v1/users/update-password/${username}`)
      .send({ password: 'nova' })
      .expect(200);
    await t
      .post(`/api/v1/users/update/${t.username}`)
      .send({ name: 'Eu' })
      .expect(400);

    const list = await t.get('/api/v1/users').expect(200);
    expect(
      list.body.find((u: { username: string }) => u.username === username),
    ).toMatchObject({
      name: 'Caixa 2',
      role: 'user',
      scope: 'PDV',
    });

    expect((await t.get('/api/v1/users/scopes').expect(200)).body).toContain(
      'PAINEL',
    );
    await t.delete(`/api/v1/users/delete/${username}`).expect(200);
  });
});
