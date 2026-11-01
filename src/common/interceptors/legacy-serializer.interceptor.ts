import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { Prisma } from '../../generated/prisma/client.js';
import { toSqlDateTime } from '../utils/legacy-format.js';

// Converte o que o Prisma devolve para o formato que o mysql2 do legado
// entregava ao frontend:
//   Date    → "YYYY-MM-DD HH:mm:ss" (colunas DATE são formatadas nos services)
//   Decimal → string com pelo menos 2 casas ("12.50")
//   BigInt  → number (COUNT/SUM em $queryRaw)
export function toLegacy(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return toSqlDateTime(value);
  if (Prisma.Decimal.isDecimal(value)) {
    const decimal = value as Prisma.Decimal;
    return decimal.toFixed(Math.max(2, decimal.decimalPlaces()));
  }
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(toLegacy);
  if (typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toLegacy(v)]),
    );
  }
  return value;
}

@Injectable()
export class LegacySerializerInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map(toLegacy));
  }
}
