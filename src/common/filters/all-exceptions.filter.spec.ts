import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown) {
  let status = 0;
  let body: unknown;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status, body };
}

describe('AllExceptionsFilter', () => {
  it('usa o formato do legado', () => {
    expect(run(new BadRequestException('Cart is empty!'))).toEqual({
      status: 400,
      body: { success: false, message: 'Cart is empty!' },
    });
  });

  it('mantém campos extras', () => {
    const error = new HttpException(
      { limitReached: true, message: 'Limite' },
      429,
    );
    expect(run(error).body).toEqual({
      success: false,
      limitReached: true,
      message: 'Limite',
    });
  });

  it('repassa corpos estruturados sem message (health)', () => {
    const body = { status: 'error', error: { database: { status: 'down' } } };
    expect(run(new ServiceUnavailableException(body)).body).toEqual(body);
  });

  it('esconde erros inesperados', () => {
    expect(run(new Error('detalhe interno'))).toEqual({
      status: 500,
      body: {
        success: false,
        message: 'Something went wrong! Please try later!',
      },
    });
  });
});
