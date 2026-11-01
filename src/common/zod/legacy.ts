import { z } from 'zod';

// Tipos reutilizáveis para validar os bodies no mesmo espírito do legado,
// que aceitava strings/números/booleanos de forma frouxa e só checava
// campos obrigatórios com `if (!(a && b))`.

export const REQUIRED_DETAILS = 'Please provide required details!';

export const requiredText = (message = REQUIRED_DETAILS) =>
  z
    .union([z.string(), z.number()], { error: message })
    .transform((v) => String(v).trim())
    .refine((v) => v.length > 0, message);

export const optionalText = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) =>
    v === undefined || v === null || v === '' ? null : String(v),
  );

// Número obrigatório e diferente de zero (o legado tratava 0 como ausente)
export const requiredNumber = (message = REQUIRED_DETAILS) =>
  z
    .union([z.number(), z.string()], { error: message })
    .transform((v) => Number(v))
    .refine((v) => !Number.isNaN(v) && v !== 0, message);

export const optionalNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) =>
    v === undefined || v === null || v === '' || Number.isNaN(Number(v))
      ? null
      : Number(v),
  );

// Booleano vindo como true/false, 0/1 ou "0"/"1"/"true"/"false"
export const flag = z
  .union([z.boolean(), z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
    return Boolean(v);
  });

export const idParam = z.coerce.number().int().positive();
