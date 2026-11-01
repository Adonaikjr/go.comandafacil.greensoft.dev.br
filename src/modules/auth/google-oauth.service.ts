import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

export interface GoogleUser {
  email?: string;
  name?: string;
  picture?: string;
}

@Injectable()
export class GoogleOAuthService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get redirectUri() {
    return `${this.config.get('BACKEND_URL', { infer: true })}/api/v1/auth/google/callback`;
  }

  getAuthUrl() {
    const params = new URLSearchParams({
      client_id: this.config.get('GOOGLE_CLIENT_ID', { infer: true }) ?? '',
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
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
