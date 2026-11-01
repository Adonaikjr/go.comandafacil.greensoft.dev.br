export const QUEUE = {
  DELIVERY: 'delivery-polling',
  STRIPE: 'stripe-events',
  MAIL: 'mail',
  AI: 'ai-content',
  MAINTENANCE: 'maintenance',
} as const;

// Tentativas com espera exponencial (2 s, 4 s, 8 s...) e histórico enxuto
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { count: 1_000, age: 7 * 24 * 3600 },
  removeOnFail: { count: 5_000, age: 30 * 24 * 3600 },
};
