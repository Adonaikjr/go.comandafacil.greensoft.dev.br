import { z } from 'zod';
import { optionalNumber, optionalText } from '../../../common/zod/legacy.js';

const required =
  'Por favor, forneça os detalhes necessários: Cliente, Data, Contagem de Pessoas!';

// Data/hora no horário de São Paulo, como o frontend envia ("YYYY-MM-DD HH:mm")
const dateTime = z.string().trim().min(1);

export const createReservationSchema = z.object({
  customerId: z
    .union([z.string(), z.number()], { error: required })
    .transform(String)
    .refine((v) => v.length > 0, required),
  date: dateTime
    .or(z.literal(''))
    .optional()
    .refine((v) => !!v, required),
  tableId: optionalNumber,
  status: optionalText,
  notes: optionalText,
  peopleCount: z
    .union([z.number(), z.string()], { error: required })
    .transform(Number)
    .refine((v) => !Number.isNaN(v) && v !== 0, required),
});
export type CreateReservationDto = z.infer<typeof createReservationSchema>;

export const updateReservationSchema = z.object({
  date: dateTime.nullish(),
  tableId: optionalNumber,
  status: optionalText,
  notes: optionalText,
  peopleCount: optionalNumber,
});
export type UpdateReservationDto = z.infer<typeof updateReservationSchema>;

export const searchQuerySchema = z.object({
  q: z
    .string({ error: 'Please provide required details!' })
    .min(1, 'Please provide required details!'),
});
