import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';

// Equivale a isSuperAdmin do legado: o token precisa ser de um superadmin
// cadastrado (tabela superadmins). Use junto com @SkipSubscription().
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: { username?: string; role?: string } }>();
    if (!user?.username || user.role !== 'superadmin') {
      throw new UnauthorizedException('Access denied!');
    }
    const admin = await this.prisma.superadmins.findUnique({
      where: { email: user.username },
      select: { email: true },
    });
    if (!admin) throw new UnauthorizedException('Access denied!');
    return true;
  }
}
