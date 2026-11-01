import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../../config/env.schema.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';

type StringValue = `${number}${'s' | 'm' | 'h' | 'd'}` | `${number}`;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private sign(payload: JwtPayload, expiresIn: string) {
    return this.jwt.sign(payload, {
      expiresIn: expiresIn as StringValue,
      issuer: this.config.get('FRONTEND_DOMAIN_COOKIE', { infer: true }),
    });
  }

  signAccess(payload: JwtPayload) {
    return this.sign(payload, this.config.get('JWT_EXPIRY', { infer: true }));
  }

  signRefresh(payload: JwtPayload) {
    return this.sign(
      payload,
      this.config.get('JWT_EXPIRY_REFRESH', { infer: true }),
    );
  }

  verify(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token, {
      issuer: this.config.get('FRONTEND_DOMAIN_COOKIE', { infer: true }),
    });
  }
}
