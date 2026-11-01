import { SetMetadata } from '@nestjs/common';
import type { Scope } from '../enums/scope.enum.js';

export const SCOPES_KEY = 'scopes';

// Basta o usuário ter UM dos escopos informados (admins sempre passam).
// @Scopes() sem argumentos libera apenas admins.
export const Scopes = (...scopes: Scope[]) => SetMetadata(SCOPES_KEY, scopes);
