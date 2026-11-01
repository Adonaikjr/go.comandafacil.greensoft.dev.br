import { decryptSecret, encryptSecret } from './secret-box.js';

describe('secret-box', () => {
  it('criptografa e descriptografa', () => {
    const encrypted = encryptSecret('meu-segredo', 'chave');
    expect(encrypted).toMatch(/^enc:/);
    expect(encrypted).not.toContain('meu-segredo');
    expect(decryptSecret(encrypted, 'chave')).toBe('meu-segredo');
  });

  it('aceita valores antigos em texto puro', () => {
    expect(decryptSecret('texto-puro', 'chave')).toBe('texto-puro');
  });

  it('falha com a chave errada', () => {
    expect(() => decryptSecret(encryptSecret('x', 'a'), 'b')).toThrow();
  });
});
