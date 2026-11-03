import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../../config/env.schema.js';

export interface GoogleUser {
  email?: string;
  name?: string;
  picture?: string;
}

// Login do app nativo (Comanda Fácil): o app abre /auth/google num navegador
// do sistema com redirect_uri + code_challenge (PKCE S256). No callback o
// backend devolve ao app um código curto, que só vale junto com o
// code_verifier — interceptar o deep link não basta para entrar.
export interface GoogleAppState {
  redirectUri: string;
  challenge: string;
}

export interface GoogleAppCode {
  username: string;
  tenantId: number;
}

const APP_REDIRECT_SCHEMES = ['comandafacil:', 'exp:'];
const APP_STATE_AUDIENCE = 'google-app-state';
const APP_CODE_AUDIENCE = 'google-app-code';

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
  ) {}

  private get redirectUri() {
    return `${this.config.get('BACKEND_URL', { infer: true })}/api/v1/auth/google/callback`;
  }

  // Segredo derivado: estes JWTs nunca podem passar como access token
  private get appSecret() {
    return `${this.config.get('JWT_SECRET', { infer: true })}:google-app`;
  }

  getAuthUrl(state?: string) {
    const params = new URLSearchParams({
      client_id: this.config.get('GOOGLE_CLIENT_ID', { infer: true }) ?? '',
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      ...(state && { state }),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  isAppRedirect(uri: string) {
    try {
      return APP_REDIRECT_SCHEMES.includes(new URL(uri).protocol);
    } catch {
      return false;
    }
  }

  signAppState(redirectUri: string, challenge: string) {
    return this.jwt.sign(
      { r: redirectUri, c: challenge },
      {
        secret: this.appSecret,
        audience: APP_STATE_AUDIENCE,
        expiresIn: '10m',
      },
    );
  }

  verifyAppState(state: string): GoogleAppState | null {
    try {
      const { r, c } = this.jwt.verify<{ r: string; c: string }>(state, {
        secret: this.appSecret,
        audience: APP_STATE_AUDIENCE,
      });
      return this.isAppRedirect(r) ? { redirectUri: r, challenge: c } : null;
    } catch {
      return null;
    }
  }

  signAppCode(username: string, tenantId: number, challenge: string) {
    return this.jwt.sign(
      { u: username, t: tenantId, c: challenge },
      { secret: this.appSecret, audience: APP_CODE_AUDIENCE, expiresIn: '2m' },
    );
  }

  verifyAppCode(code: string, verifier: string): GoogleAppCode | null {
    try {
      const { u, t, c } = this.jwt.verify<{ u: string; t: number; c: string }>(
        code,
        { secret: this.appSecret, audience: APP_CODE_AUDIENCE },
      );
      const hashed = createHash('sha256').update(verifier).digest('base64url');
      return hashed === c ? { username: u, tenantId: t } : null;
    } catch {
      return null;
    }
  }

  appRedirect(redirectUri: string, params: Record<string, string>) {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async getUser(code: string): Promise<GoogleUser> {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: this.config.get('GOOGLE_CLIENT_ID', { infer: true }),
        client_secret: this.config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok)
      throw new Error(`Google token error: ${await tokenRes.text()}`);
    const { access_token } = (await tokenRes.json()) as {
      access_token: string;
    };

    const userRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${access_token}` },
      },
    );
    if (!userRes.ok)
      throw new Error(`Google userinfo error: ${await userRes.text()}`);
    return (await userRes.json()) as GoogleUser;
  }
}
