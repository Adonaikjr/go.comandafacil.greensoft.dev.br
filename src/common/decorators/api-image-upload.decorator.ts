import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';

// Upload de uma imagem no campo multipart `image` (mesmo nome do legado)
export const ApiImageUpload = (field = 'image') =>
  applyDecorators(
    UseInterceptors(
      FileInterceptor(field, { limits: { fileSize: 10 * 1024 * 1024 } }),
    ),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: { [field]: { type: 'string', format: 'binary' } },
        required: [field],
      },
    }),
  );
