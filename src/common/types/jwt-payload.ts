import type { Role } from '../enums/role.enum.js';

// Payload emitido pelo backend legado (auth.controller.js) — manter compatível
export interface JwtPayload {
  tenant_id: number;
  username: string;
  name: string | null;
  role: Role;
  scope: string | null;
  is_active: number | null;
  trial_started_at?: string | null;
  plan_type?: string;
}
