import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.schema.js';
import { DB_UTC_OFFSET } from '../common/utils/db-time.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<Env, true>) {
    const url = new URL(config.get('DATABASE_URL', { infer: true }));
    super({
      adapter: new PrismaMariaDb({
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: decodeURIComponent(url.pathname.slice(1)),
        connectionLimit: 10,
        // O banco de dev é remoto e abrir conexão leva segundos
        connectTimeout: 15_000,
        acquireTimeout: 30_000,
        // NOW()/CURRENT_TIMESTAMP no horário de São Paulo (ver db-time.ts).
        // `initSql` não funciona com pool no driver mariadb; sessionVariables sim.
        sessionVariables: { time_zone: DB_UTC_OFFSET },
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
