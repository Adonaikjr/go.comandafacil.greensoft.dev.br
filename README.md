# Comanda Fácil API

Backend em NestJS 12 + TypeScript (ESM) + Prisma 7 (MySQL) que substitui o
`backend-legado` (Express). O plano completo está em
[MIGRACAO_NESTJS.md](MIGRACAO_NESTJS.md).

## Rodando

```bash
cp .env.example .env        # preencha DATABASE_URL, JWT_SECRET etc.
npm install                 # roda `prisma generate` no postinstall
npm run prisma:migrate      # aplica as migrations no banco do DATABASE_URL
npm run start:dev
```

- API: `http://localhost:3333/api/v1`
- Swagger: `http://localhost:3333/docs` (JSON em `/docs/json`)
- Scalar: `http://localhost:3333/reference`
- Health: `http://localhost:3333/health` (banco + Redis)
- Filas (Bull Board): `http://localhost:3333/admin/queues` (superadmin logado ou `BULL_BOARD_USER`/`BULL_BOARD_PASSWORD`)
- Socket.IO: mesma porta da API

Requer Redis (`docker compose up -d redis`) para filas e Socket.IO.

## Testes

```bash
npm test            # unitários (src/**/*.spec.ts)
npm run test:e2e    # e2e contra o banco do DATABASE_URL (cria e remove um tenant temporário)
```

## Banco

- `prisma/migrations/0_init` é o schema do banco legado (`pdv`) em 01/11/2026.
- Este projeto é o **único** que roda migrations. Para mudar o schema, edite
  `prisma/schema.prisma`, gere o SQL e aplique:

  ```bash
  mkdir prisma/migrations/<n>_<nome>
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<n>_<nome>/migration.sql
  npm run prisma:migrate
  ```

  (`prisma migrate dev` precisa de permissão para criar um shadow database,
  que o usuário do banco de dev não tem.)

## Convenções

- Um módulo por domínio em `src/modules/<nome>` com controller, service,
  `dto/*.schema.ts` (Zod) e testes.
- Validação e Swagger com `@ZodBody`, `@ZodQuery` e `@ZodResponse`
  (`src/common/decorators/zod.decorator.ts`).
- Toda rota é autenticada por padrão. Use `@Public()`, `@SkipSubscription()` e
  `@Scopes(Scope.X)` para ajustar.
- As respostas seguem o formato do legado para o frontend não mudar; erros
  saem como `{ success: false, message }`.
