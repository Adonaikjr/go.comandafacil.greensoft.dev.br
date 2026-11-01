import { applyDecorators, UsePipes } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { z, type ZodObject, type ZodType } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe.js';

type OpenApiSchema = Record<string, any>;

function toOpenApi(schema: ZodType): OpenApiSchema {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    unrepresentable: 'any',
  }) as OpenApiSchema;
  return json;
}

// Valida o body com Zod e documenta no Swagger com o mesmo schema
export const ZodBody = (schema: ZodType) =>
  applyDecorators(
    ApiBody({ schema: toOpenApi(schema) }),
    UsePipes(new ZodValidationPipe(schema, 'body')),
  );

// Valida a query string com Zod e documenta cada campo no Swagger
export const ZodQuery = (schema: ZodObject) => {
  const json = toOpenApi(schema);
  const required = new Set<string>(json.required ?? []);
  const queries = Object.entries<OpenApiSchema>(json.properties ?? {}).map(
    ([name, prop]) =>
      ApiQuery({ name, schema: prop, required: required.has(name) }),
  );
  return applyDecorators(
    ...queries,
    UsePipes(new ZodValidationPipe(schema, 'query')),
  );
};

// Apenas documentação da resposta (não valida a saída)
export const ZodResponse = (schema: ZodType, status = 200) =>
  ApiResponse({ status, schema: toOpenApi(schema) });
