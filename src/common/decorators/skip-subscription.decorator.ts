import { SetMetadata } from '@nestjs/common';

export const SKIP_SUBSCRIPTION_KEY = 'skipSubscription';

// Rotas autenticadas que devem funcionar mesmo com assinatura vencida
export const SkipSubscription = () => SetMetadata(SKIP_SUBSCRIPTION_KEY, true);
