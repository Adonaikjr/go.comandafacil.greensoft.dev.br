import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PRO_KEY = 'requiresPro';

// Rotas que só funcionam no plano Pro (assinatura ativa ou teste vigente)
export const RequiresPro = () => SetMetadata(REQUIRES_PRO_KEY, true);
