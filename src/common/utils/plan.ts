import { HttpException, HttpStatus } from '@nestjs/common';

export const TRIAL_DAYS = 14;

// Plano grátis: dono + 1 funcionário
export const FREE_MAX_USERS = 2;

// Plano Pro = assinatura ativa ou período de teste vigente. Sem isso a loja
// não é bloqueada: cai no plano grátis, que nunca expira.
export function hasProAccess(tenant: {
  is_active?: number | boolean | null;
  trial_started_at?: string | Date | null;
}): boolean {
  if (Number(tenant.is_active) === 1) return true;
  if (!tenant.trial_started_at) return false;

  const trialEnd =
    new Date(tenant.trial_started_at).getTime() +
    TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() < trialEnd;
}

// 402 = recurso do plano Pro. O app e o web tratam esse status como "assine"
export class ProRequiredException extends HttpException {
  constructor(message = 'Este recurso faz parte do plano Pro.') {
    super(message, HttpStatus.PAYMENT_REQUIRED);
  }
}

// Relatórios e faturas: o plano grátis só vê o dia de hoje
export function assertPeriodAllowed(
  tenant: Parameters<typeof hasProAccess>[0],
  type: string | undefined,
) {
  if (type === 'today' || hasProAccess(tenant)) return;
  throw new ProRequiredException(
    'O histórico de dias anteriores faz parte do plano Pro.',
  );
}
