import { createHash } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../../config/env.schema.js';
import { GoogleOAuthService } from './google-oauth.service.js';

const env: Partial<Env> = { JWT_SECRET: 'segredo-teste' };
const config = {
  get: (key: keyof Env) => env[key],
} as unknown as ConfigService<Env, true>;

const verifier = 'v'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');

describe('GoogleOAuthService (app nativo)', () => {
  const jwt = new JwtService({ secret: 'segredo-teste' });
  const google = new GoogleOAuthService(config, jwt);

  it('aceita só os esquemas do app no redirect', () => {
    expect(google.isAppRedirect('comandafacil://auth/google')).toBe(true);
    expect(google.isAppRedirect('exp://192.168.0.2:8081/--/auth/google')).toBe(
      true,
    );
    expect(google.isAppRedirect('https://evil.example.com')).toBe(false);
    expect(google.isAppRedirect('não é url')).toBe(false);
  });

  it('state assinado volta com redirect e challenge', () => {
    const state = google.signAppState('comandafacil://auth/google', challenge);
    expect(google.verifyAppState(state)).toEqual({
      redirectUri: 'comandafacil://auth/google',
      challenge,
    });
    expect(google.verifyAppState(state + 'x')).toBeNull();
  });

  it('código só vale com o code_verifier certo', () => {
    const code = google.signAppCode('dono@example.com', 7, challenge);
    expect(google.verifyAppCode(code, verifier)).toEqual({
      username: 'dono@example.com',
      tenantId: 7,
    });
    expect(google.verifyAppCode(code, 'w'.repeat(64))).toBeNull();
  });

  it('JWTs do fluxo do app não passam como access token', () => {
    const code = google.signAppCode('dono@example.com', 7, challenge);
    expect(() => jwt.verify(code)).toThrow();
    // state e código usam audiences diferentes
    const state = google.signAppState('comandafacil://auth/google', challenge);
    expect(google.verifyAppCode(state, verifier)).toBeNull();
  });

  it('monta o deep link de volta ao app', () => {
    expect(
      google.appRedirect('comandafacil://auth/google', { code: 'a b' }),
    ).toBe('comandafacil://auth/google?code=a+b');
  });
});
