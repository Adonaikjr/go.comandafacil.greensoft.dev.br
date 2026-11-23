import { describe, expect, it } from 'vitest';
import { kitchenMessage, readyMessage } from './push.service.js';

describe('textos do push de pedido', () => {
  it('pedido novo na cozinha mostra senha e mesa', () => {
    expect(kitchenMessage(12, '4')).toEqual({
      title: 'Pedido novo na cozinha',
      body: 'Senha 12 · Mesa 4',
    });
    expect(kitchenMessage(null, null).body).toBe('Balcão');
  });

  it('pedido pronto soma os itens e cai no balcão sem mesa', () => {
    expect(readyMessage(7, '2', 3).body).toBe(
      'Mesa 2 · 3 itens prontos · Senha 7',
    );
    expect(readyMessage(null, null, 1).body).toBe('Balcão · 1 item pronto');
  });
});
