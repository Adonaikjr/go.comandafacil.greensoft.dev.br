import { z } from 'zod';
import { optionalNumber, requiredText } from '../../../common/zod/legacy.js';

const titlePrice = 'Please provide required details: title, price';

export const menuItemSchema = z.object({
  title: requiredText(titlePrice),
  price: z
    .union([z.number(), z.string()], { error: titlePrice })
    .transform(Number)
    .refine((v) => !Number.isNaN(v) && v !== 0, titlePrice),
  netPrice: optionalNumber,
  taxId: optionalNumber,
  categoryId: optionalNumber,
});
export type MenuItemDto = z.infer<typeof menuItemSchema>;

export const menuItemExtraSchema = z.object({
  title: requiredText('Please provide required details: title'),
  price: optionalNumber.transform((v) => v ?? 0),
});
export type MenuItemExtraDto = z.infer<typeof menuItemExtraSchema>;
