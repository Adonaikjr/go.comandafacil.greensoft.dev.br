import { z } from 'zod';
import {
  flag,
  optionalNumber,
  optionalText,
  requiredNumber,
  requiredText,
} from '../../../common/zod/legacy.js';

export const storeSettingsSchema = z.object({
  storeName: optionalText,
  address: optionalText,
  phone: optionalText,
  email: optionalText,
  currency: optionalText,
  isQRMenuEnabled: flag,
  isQROrderEnabled: flag,
});
export type StoreSettingsDto = z.infer<typeof storeSettingsSchema>;

export const printSettingsSchema = z.object({
  pageFormat: optionalText,
  header: optionalText,
  footer: optionalText,
  showNotes: flag,
  isEnablePrint: flag,
  showStoreDetails: flag,
  showCustomerDetails: flag,
  printToken: flag,
});
export type PrintSettingsDto = z.infer<typeof printSettingsSchema>;

export const taxSchema = z.object({
  title: requiredText(),
  rate: requiredNumber(),
  type: z.enum(['inclusive', 'exclusive', 'other'], {
    error: 'Please provide required details!',
  }),
});
export type TaxDto = z.infer<typeof taxSchema>;

export const paymentTypeSchema = z.object({
  title: requiredText(),
  isActive: flag,
});
export type PaymentTypeDto = z.infer<typeof paymentTypeSchema>;

export const togglePaymentTypeSchema = z.object({ isActive: flag });
export type TogglePaymentTypeDto = z.infer<typeof togglePaymentTypeSchema>;

export const storeTableSchema = z.object({
  title: requiredText(),
  floor: requiredText(),
  seatingCapacity: requiredNumber().refine(
    (v) => v >= 0,
    'Please provide valid seating capacity count!',
  ),
});
export type StoreTableDto = z.infer<typeof storeTableSchema>;

export const categorySchema = z.object({ title: requiredText() });
export type CategoryDto = z.infer<typeof categorySchema>;

export { optionalNumber };
