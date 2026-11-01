import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3333),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(1),
  JWT_EXPIRY: z.string().min(1),
  JWT_EXPIRY_REFRESH: z.string().min(1),
  COOKIE_EXPIRY: z.coerce.number(),
  COOKIE_EXPIRY_REFRESH: z.coerce.number(),
  PASSWORD_SALT: z.coerce.number().default(10),

  FRONTEND_DOMAIN: z.string().min(1),
  FRONTEND_DOMAIN_COOKIE: z.string().min(1),
  // Origens extras aceitas no CORS, separadas por vírgula
  CORS_EXTRA_ORIGINS: z.string().optional(),

  STRIPE_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_EMAIL: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  ENCRYPTION_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  BACKEND_URL: z.string().default('http://localhost:3333'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
