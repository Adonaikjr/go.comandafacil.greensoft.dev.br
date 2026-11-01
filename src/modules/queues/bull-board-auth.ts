import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { TokenService } from '../auth/token.service.js';

const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Protege o painel /admin/queues: aceita o token de superadmin (cookie
// accessToken ou Bearer) ou basic auth com BULL_BOARD_USER/PASSWORD.
export function bullBoardAuth(
  tokens: TokenService,
  user?: string,
  password?: string,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';

    if (user && password && header.startsWith('Basic ')) {
      const [u, p] = Buffer.from(header.slice(6), 'base64')
        .toString()
        .split(':');
      if (safeEqual(u ?? '', user) && safeEqual(p ?? '', password))
        return next();
    }

    const cookieToken = /(?:^|;\s*)accessToken=([^;]+)/.exec(
      req.headers.cookie ?? '',
    )?.[1];
    const token = header.startsWith('Bearer ') ? header.slice(7) : cookieToken;
    if (token) {
      try {
        const payload = tokens.verify(decodeURIComponent(token)) as unknown as {
          role?: string;
        };
        if (payload.role === 'superadmin') return next();
      } catch {
        // cai no 401
      }
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="queues"');
    res.status(401).json({ success: false, message: 'Unauthorized access!' });
  };
}
