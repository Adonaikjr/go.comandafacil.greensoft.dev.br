import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import type { Env } from '../../config/env.schema.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { JwtPayload } from '../types/jwt-payload.js';

// Equivale a isLoggedIn + isAuthenticated do legado: token no cookie
// `accessToken` ou no header `Authorization: Bearer`.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Login to access this area!');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        issuer: this.config.get('FRONTEND_DOMAIN_COOKIE', { infer: true }),
      });
      request.user = payload;
      this.cls.set('tenantId', payload.tenant_id);
      this.cls.set('username', payload.username);
      return true;
    } catch {
      throw new UnauthorizedException('Unauthorized access!');
    }
  }

  private extractToken(request: Request): string | undefined {
    const cookieToken = request.cookies?.accessToken as string | undefined;
    if (cookieToken) return cookieToken;

    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
