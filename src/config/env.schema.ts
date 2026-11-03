import { z } from 'zod';

const booleanEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

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

  // Opcional: com o "enhanced security" do Expo Push ligado, o envio exige o token.
  EXPO_ACCESS_TOKEN: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_EMAIL: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  ENCRYPTION_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  BACKEND_URL: z.string().default('http://localhost:3333'),
  KEETA_API_BASE: z.string().default('https://api.keeta.com.br'),

  // Socket.IO — ver src/modules/realtime/realtime.gateway.ts
  // true: aceita `authenticate(tenantId)` sem token (comportamento do legado).
  // Desligar quando o frontend enviar o cookie (withCredentials) ou auth.token.
  SOCKET_LEGACY_AUTH: booleanEnv.default(true),
  // true: o backend emite new_order/new_qrorder/order_update sozinho e ignora
  // os eventos *_backend repassados pelo frontend.
  REALTIME_SERVER_EVENTS: booleanEnv.default(false),

  // Filas (BullMQ) — ver src/modules/queues
  // Painel em /admin/queues: superadmin logado ou basic auth com estes dados
  BULL_BOARD_USER: z.string().optional(),
  BULL_BOARD_PASSWORD: z.string().optional(),
  DELIVERY_POLL_INTERVAL_MS: z.coerce.number().int().min(5000).default(30_000),
  // Cron para gerar post do blog com IA (ex.: "0 9 * * 1"); vazio = desligado
  BLOG_AI_CRON: z.string().optional(),
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
