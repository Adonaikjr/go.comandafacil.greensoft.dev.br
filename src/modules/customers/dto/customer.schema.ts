import { z } from 'zod';

const gender = z.enum(['male', 'female', 'other']);

// Aceita "YYYY-MM-DD" (como o frontend envia hoje); vazio vira null
const optionalDate = z
  .union([z.iso.date(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null));

const requiredDetails = 'Please provide required details: Name, Phone!';

export const createCustomerSchema = z.object({
  phone: z
    .string({ error: requiredDetails })
    .trim()
    .min(1, requiredDetails)
    .max(20),
  name: z
    .string({ error: requiredDetails })
    .trim()
    .min(1, requiredDetails)
    .max(255),
  email: optionalText,
  birthDate: optionalDate,
  gender: gender
    .nullish()
    .or(z.literal(''))
    .transform((v) => v || null),
  isMember: z
    .union([z.boolean(), z.literal(0), z.literal(1)])
    .optional()
    .transform(Boolean),
});
export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.omit({
  phone: true,
  isMember: true,
});
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(10),
  sort: z.enum(['name', 'phone', 'created_at']).optional(),
  filter: z.string().trim().optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export const searchCustomersQuerySchema = z.object({
  q: z.string().trim().default(''),
});
export type SearchCustomersQuery = z.infer<typeof searchCustomersQuerySchema>;

// Documentação das respostas (formato herdado do legado)
export const customerSchema = z.object({
  phone: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  birth_date: z.string().nullable().meta({ example: '1990-05-21' }),
  gender: gender.nullable(),
  is_member: z.number().nullable().meta({ example: 0 }),
  created_at: z.string().nullable().meta({ example: '2026-11-01 14:30:00' }),
});

export const customersPageSchema = z.object({
  customers: z.array(customerSchema),
  currentPage: z.number(),
  perPage: z.number(),
  totalPages: z.number(),
  totalCustomers: z.number(),
});

export const messageSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
