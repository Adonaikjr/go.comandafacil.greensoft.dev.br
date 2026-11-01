import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SCOPES_KEY } from '../decorators/scopes.decorator.js';
import { Role } from '../enums/role.enum.js';
import type { Scope } from '../enums/scope.enum.js';
import type { JwtPayload } from '../types/jwt-payload.js';

// Equivale a authorize() do legado. Consulta o usuário no banco a cada
// requisição para que mudanças de escopo valham sem esperar o token expirar.
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Guards globais valem só para HTTP; o Socket.IO autentica no gateway
    if (context.getType() !== 'http') return true;

    const requiredScopes = this.reflector.getAllAndOverride<Scope[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    // Sem @Scopes → livre. @Scopes() vazio → só admin (igual a authorize([]))
    if (!requiredScopes) return true;

    const { user: tokenUser } = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();

    const user = await this.prisma.users.findFirst({
      where: { username: tokenUser.username, tenant_id: tokenUser.tenant_id },
      select: { role: true, scope: true },
    });

    if (!user) throw new UnauthorizedException('Access denied!');
    if (user.role === Role.ADMIN) return true;

    // Escopo alterado depois da emissão do token → exige novo login
    if (user.scope != tokenUser.scope) {
      throw new ForbiddenException('Forbidden! Access Denied!');
    }

    const userScopes = user.scope?.split(',').map((s) => s.trim()) ?? [];
    if (!requiredScopes.some((scope) => userScopes.includes(scope))) {
      throw new ForbiddenException('Forbidden! Access Denied!');
    }

    return true;
  }
}
