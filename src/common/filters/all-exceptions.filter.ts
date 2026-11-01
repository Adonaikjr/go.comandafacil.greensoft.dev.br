import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

// Mantém o formato de erro do legado: { success: false, message }
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Corpos estruturados sem `message` (ex.: /health do Terminus) passam intactos
      if (typeof body === 'object' && body !== null && !('message' in body)) {
        return response.status(status).json(body);
      }
      // Campos extras (ex.: limitReached do POS) são mantidos; statusCode/error do Nest não
      const {
        statusCode: _status,
        error: _error,
        message,
        ...extra
      } = typeof body === 'string'
        ? { message: body }
        : (body as Record<string, unknown>);
      const text = Array.isArray(message)
        ? message.join(', ')
        : (message ?? exception.message);

      return response
        .status(status)
        .json({ success: false, ...extra, message: text });
    }

    this.logger.error(exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Something went wrong! Please try later!',
    });
  }
}
