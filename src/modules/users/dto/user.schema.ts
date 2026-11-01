import { z } from 'zod';
import { Scope } from '../../../common/enums/scope.enum.js';
import { optionalText, requiredText } from '../../../common/zod/legacy.js';

const scopes = z
  .array(
    z.enum(Object.values(Scope) as [Scope, ...Scope[]], {
      error: 'Invalid Request!',
    }),
    {
      error: 'Invalid Request!',
    },
  )
  .optional()
  .default([]);

export const createUserSchema = z.object({
  username: requiredText(),
  password: requiredText(),
  name: requiredText(),
  designation: optionalText,
  phone: optionalText,
  email: optionalText,
  userScopes: scopes,
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: requiredText(),
  designation: optionalText,
  phone: optionalText,
  email: optionalText,
  userScopes: scopes,
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const updatePasswordSchema = z.object({ password: requiredText() });
export type UpdatePasswordDto = z.infer<typeof updatePasswordSchema>;
