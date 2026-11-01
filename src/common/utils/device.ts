import type { Request } from 'express';
import { UserAgent } from 'express-useragent';

// Mesmo formato de device_name gravado pelo legado
export function deviceFromRequest(req: Request) {
  const agent = new UserAgent().parse(req.headers['user-agent'] ?? '');
  return {
    ip: req.socket.remoteAddress,
    name: `${agent.platform}\nBrowser: ${agent.browser}`,
  };
}
