import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

type ParamType = ArgumentMetadata['type'];

// Valida apenas o tipo de parâmetro indicado (body, query ou param), para
// poder ser aplicado no método inteiro via @UsePipes sem afetar os outros.
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(
    private readonly schema: ZodType,
    private readonly target: ParamType = 'body',
  ) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== this.target) return value;

    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues[0]?.message);
    }
    return result.data;
  }
}
