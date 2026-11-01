import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../../config/env.schema.js';

// Reproduz exatamente os cookies do legado (auth.controller.js):
// - no login: SameSite=None + Secure
// - em refresh/cancelamento de assinatura: sem SameSite, Secure só em produção
@Injectable()
export class AuthCookiesService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get domain() {
    return this.config.get('FRONTEND_DOMAIN_COOKIE', { infer: true });
  }

  private get isProduction() {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }

  refreshExpiry(): Date {
    return new Date(
      Date.now() + this.config.get('COOKIE_EXPIRY_REFRESH', { infer: true }),
    );
  }

  // `crossSite: false` reproduz os cookies do login de superadmin do legado
  setLoginCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    refreshExpiry: Date,
    { crossSite = true } = {},
  ) {
    const base: CookieOptions = crossSite
      ? { domain: this.domain, sameSite: 'none', secure: true, path: '/' }
      : { domain: this.domain, secure: this.isProduction, path: '/' };
    res.cookie('accessToken', accessToken, {
      ...base,
      httpOnly: true,
      expires: new Date(
        Date.now() + this.config.get('COOKIE_EXPIRY', { infer: true }),
      ),
    });
    res.cookie('refreshToken', refreshToken, {
      ...base,
      httpOnly: true,
      expires: refreshExpiry,
    });
    res.cookie('pdv-green', true, { ...base, expires: refreshExpiry });
  }

  setAccessCookie(res: Response, accessToken: string) {
    res.cookie('accessToken', accessToken, {
      expires: new Date(
        Date.now() + this.config.get('COOKIE_EXPIRY', { infer: true }),
      ),
      httpOnly: true,
      domain: this.domain,
      secure: this.isProduction,
      path: '/',
    });
  }

  clearAll(res: Response) {
    const base: CookieOptions = {
      domain: this.domain,
      secure: this.isProduction,
      path: '/',
    };
    res.clearCookie('accessToken', { ...base, httpOnly: true });
    res.clearCookie('refreshToken', { ...base, httpOnly: true });
    res.clearCookie('pdv-green', base);
  }
}
