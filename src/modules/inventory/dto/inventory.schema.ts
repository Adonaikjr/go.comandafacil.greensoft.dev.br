import { z } from 'zod';
import { optionalNumber, requiredText } from '../../../common/zod/legacy.js';

export const inventoryUnits = [
  'un',
  'kg',
  'g',
  'l',
  'ml',
  'cx',
  'pct',
] as const;

const invalidQuantity = 'Please provide a valid quantity!';

// Quantidades aceitam até 3 casas (kg/l fracionados), como a coluna DECIMAL(12,3)
const quantity = z.coerce
  .number({ error: invalidQuantity })
  .min(0, invalidQuantity)
  .max(999_999_999, invalidQuantity)
  .transform((v) => Math.round(v * 1000) / 1000);

export const createInventoryItemSchema = z.object({
  title: requiredText('Please provide required details: title'),
  unit: z.enum(inventoryUnits).optional().default('un'),
  minQuantity: quantity.optional().default(0),
  costPrice: optionalNumber,
  // Produto do cardápio cuja venda baixa este item (opcional)
  menuItemId: optionalNumber,
  // Saldo inicial, registrado como uma entrada
  quantity: quantity.optional().default(0),
});
export type CreateInventoryItemDto = z.infer<typeof createInventoryItemSchema>;

// O saldo só muda por movimentação, nunca pela edição do item
export const updateInventoryItemSchema = createInventoryItemSchema.omit({
  quantity: true,
});
export type UpdateInventoryItemDto = z.infer<typeof updateInventoryItemSchema>;

export const manualMovementTypes = ['entry', 'exit', 'adjustment'] as const;

// entry/exit: `quantity` é quanto entra ou sai (> 0).
// adjustment: `quantity` é o novo saldo contado (pode ser 0).
export const createMovementSchema = z
  .object({
    type: z.enum(manualMovementTypes, {
      error: 'Please provide a valid type: entry, exit, adjustment',
    }),
    quantity,
    notes: z
      .string()
      .trim()
      .max(255)
      .nullish()
      .transform((v) => v || null),
  })
  .refine((v) => v.type === 'adjustment' || v.quantity > 0, {
    message: invalidQuantity,
    path: ['quantity'],
  });
export type CreateMovementDto = z.infer<typeof createMovementSchema>;

export const listInventoryQuerySchema = z.object({
  filter: z.string().trim().optional(),
  lowStock: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;

export const listMovementsQuerySchema = z.object({
  itemId: z.coerce.number().int().positive().optional(),
  type: z
    .enum(['entry', 'exit', 'adjustment', 'sale', 'sale_return'])
    .optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(30),
});
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
