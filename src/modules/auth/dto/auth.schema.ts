import { z } from 'zod';

const required = 'Por favor, forneça os detalhes necessários!';
const requiredString = z.string({ error: required }).trim().min(1, required);

export const signInSchema = z.object({
  username: requiredString,
  password: z.string({ error: required }).min(1, required),
});
export type SignInDto = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  biz_name: requiredString,
  username: requiredString,
  password: z.string({ error: required }).min(1, required),
});
export type SignUpDto = z.infer<typeof signUpSchema>;

export const removeDeviceSchema = z.object({
  device_id: z.union([z.coerce.number().int(), z.string()]),
});
export type RemoveDeviceDto = z.infer<typeof removeDeviceSchema>;

export const forgotPasswordSchema = z.object({
  username: z
    .string({ error: 'Por favor, forneça o endereço de e-mail!' })
    .trim()
    .min(1, 'Por favor, forneça o endereço de e-mail!'),
});
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  password: z.string({ error: required }).min(1, required),
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const googleExchangeSchema = z.object({
  code: requiredString,
  code_verifier: requiredString,
});
export type GoogleExchangeDto = z.infer<typeof googleExchangeSchema>;

export const messageSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
