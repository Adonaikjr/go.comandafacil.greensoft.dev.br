import { z } from 'zod';
import { optionalNumber, optionalText } from '../../../common/zod/legacy.js';

export const cartItemSchema = z.looseObject({
  id: z.coerce.number().int(),
  variant_id: optionalNumber,
  price: z.coerce.number(),
  quantity: z.coerce.number().int().positive(),
  notes: optionalText,
  addons_ids: z.array(z.coerce.number().int()).nullish(),
});
export type CartItem = z.infer<typeof cartItemSchema>;

const cart = z
  .array(cartItemSchema, { error: 'Cart is empty!' })
  .min(1, 'Cart is empty!');

export const createOrderSchema = z.object({
  cart,
  deliveryType: optionalText,
  customerType: z.enum(['WALKIN', 'CUSTOMER']).nullish(),
  // O frontend envia o objeto do cliente selecionado; o legado usava só o telefone
  customerId: z.looseObject({ phone: z.string().nullish() }).nullish(),
  tableId: optionalNumber,
  selectedQrOrderItem: optionalNumber,
});
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const createOrderAndInvoiceSchema = createOrderSchema.extend({
  netTotal: z.coerce.number(),
  taxTotal: z.coerce.number(),
  total: z.coerce.number(),
});
export type CreateOrderAndInvoiceDto = z.infer<
  typeof createOrderAndInvoiceSchema
>;

export const orderIdsSchema = z.object({
  orderIds: z
    .array(z.coerce.number().int(), { error: 'Invalid Request!' })
    .min(1, 'Invalid Request!'),
});
export type OrderIdsDto = z.infer<typeof orderIdsSchema>;

export const payOrdersSchema = orderIdsSchema.extend({
  subTotal: z.coerce.number(),
  taxTotal: z.coerce.number(),
  total: z.coerce.number(),
});
export type PayOrdersDto = z.infer<typeof payOrdersSchema>;

export const itemStatusSchema = z.object({
  status: z.enum(
    ['created', 'preparing', 'completed', 'cancelled', 'delivered'],
    {
      error: 'Invalid Request!',
    },
  ),
});
export type ItemStatusDto = z.infer<typeof itemStatusSchema>;

export const qrOrderStatusSchema = z.object({
  status: z.enum(['created', 'completed', 'cancelled'], {
    error: 'Please provide required details!',
  }),
});
export type QrOrderStatusDto = z.infer<typeof qrOrderStatusSchema>;
