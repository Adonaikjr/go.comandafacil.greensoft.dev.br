import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const schema = z.object({ name: z.string().min(1, 'Nome obrigatório') });
  const pipe = new ZodValidationPipe(schema, 'body');

  it('devolve o valor transformado quando é válido', () => {
    expect(pipe.transform({ name: 'Ana', extra: 1 }, { type: 'body' })).toEqual(
      { name: 'Ana' },
    );
  });

  it('usa a mensagem do primeiro erro', () => {
    expect(() => pipe.transform({ name: '' }, { type: 'body' })).toThrow(
      new BadRequestException('Nome obrigatório'),
    );
  });

  it('ignora parâmetros de outro tipo', () => {
    expect(pipe.transform('42', { type: 'param' })).toBe('42');
  });
});
