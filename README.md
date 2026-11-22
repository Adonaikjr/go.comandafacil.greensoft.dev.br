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
O MySQL de desenvolvimento é o remoto (`dev-db.greensoft.dev.br`); para subir um
banco local use `docker compose --profile local-db up -d`.

### Variáveis de ambiente

O `.env.example` lista todas. As mais importantes:

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | Conexão MySQL usada pelo Prisma |
| `REDIS_URL` | Filas (Bull) e Socket.IO |
| `JWT_SECRET` · `JWT_EXPIRY` · `JWT_EXPIRY_REFRESH` | Tokens de sessão |
| `PASSWORD_SALT` · `ENCRYPTION_KEY` | Segredos de hash de senha e de criptografia |
| `FRONTEND_DOMAIN` · `FRONTEND_DOMAIN_COOKIE` · `CORS_EXTRA_ORIGINS` | CORS e cookies |
| `STRIPE_SECRET` · `STRIPE_WEBHOOK_SECRET` | Assinaturas. Sem o webhook secret o webhook recusa todos os eventos |
| `SMTP_*` | E-mails (recuperação de senha, faturas) |
| `GEMINI_API_KEY` · `BLOG_AI_CRON` | Geração de conteúdo do blog |
| `BULL_BOARD_USER` · `BULL_BOARD_PASSWORD` | Acesso ao painel de filas fora do superadmin |
| `DELIVERY_POLL_INTERVAL_MS` | Intervalo do polling de entregas |
| `KEETA_API_BASE` | Base da integração Keeta (ainda não usada pelo app móvel) |

Nunca versione o `.env`. Em produção ele fica na VPS.

## Deploy no CloudPanel

O workflow `.github/workflows/deploy.yml` publica automaticamente após um push
na branch `main` (ou manualmente pela aba Actions). Ele compila e envia somente
os arquivos da aplicação; `.env` não é enviado pelo workflow nem versionado.

Na primeira configuração:

1. Confirme que o usuário de site do CloudPanel tem Node.js 22 e acesso SSH.
   O bootstrap e o workflow fixam npm em `11.8.0` para manter instalação
   compatível com o lockfile.
2. No diretório raiz local, rode `bash deploy/bootstrap-vps.sh`. Informe a senha
   SSH quando solicitada. O script copia o `.env` local diretamente para a VPS,
   ajusta `PORT=5000`, restringe as permissões do arquivo e prepara o PM2.
3. Se o script imprimir um comando `sudo`, execute-o uma vez na VPS para
   registrar o serviço PM2 do usuário no systemd. Esse passo é necessário para
   o PM2 iniciar após uma reinicialização do servidor.
4. No GitHub, cadastre a chave privada gerada em
   `~/.ssh/comandafacil-vps-deploy` como Actions secret
   `VPS_SSH_PRIVATE_KEY`. Por exemplo:
   `gh secret set VPS_SSH_PRIVATE_KEY < ~/.ssh/comandafacil-vps-deploy`.
   Cadastre também `VPS_KNOWN_HOSTS` como Actions variable. Ela deve conter a
   chave pública SSH retornada por
   `ssh-keyscan -p 22 comandafacil.greensoft.dev.br`; confira a impressão
   digital dessa chave por um canal confiável antes de salvá-la. Para
   cadastrá-la com o GitHub CLI:
   `gh variable set VPS_KNOWN_HOSTS --body "$(ssh-keyscan -p 22 comandafacil.greensoft.dev.br)"`.
5. Faça o primeiro deploy pela aba Actions ou envie um commit para `main`.

O deploy instala as dependências de produção, aplica as migrations pendentes
(`npm run prisma:migrate`, com o `.env` da VPS), inicia/recarrega a aplicação
no PM2 e executa `pm2 save`. Se a migration falhar, a aplicação não é
recarregada e a versão anterior continua no ar. Por isso o `prisma` (CLI) fica
em `dependencies`: o `npm ci --omit=dev` da VPS precisa dele. O arquivo `.env`
permanece no servidor e não é removido pelo `rsync`. O CloudPanel deve encaminhar o domínio para a porta 5000.

O deploy usa uma chave SSH dedicada, sem senha SSH armazenada no workflow.
Rotacione senhas/chaves que tenham sido compartilhadas em mensagens ou
terminais.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run start:dev` | API com recarga automática (`nest start --watch`) |
| `npm run start:debug` | Igual, com depurador |
| `npm run build` | `prisma generate` + `nest build` |
| `npm run start:prod` | Roda `dist/main` (o que o PM2 executa) |
| `npm run prisma:generate` · `prisma:migrate` · `prisma:status` | Cliente Prisma, migrations aplicadas, status das migrations |
| `npm run data:migrate-legacy` | Importa dados do banco do `backend-legado` (`scripts/migrate-legacy-data.ts`) |
| `npm run lint` · `npm run format` | oxlint e Prettier |

## Módulos

Cada pasta em `src/modules/` é um domínio com controller, service e DTOs Zod:

| módulo | responsabilidade |
| --- | --- |
| `auth` · `users` · `account` | login, refresh, usuários da loja e exclusão de conta |
| `settings` · `superadmin` | configurações da loja e painel do superadmin |
| `billing` | assinatura Stripe, trial e plano (Pro e grátis) |
| `menu-items` · `inventory` · `customers` | cardápio, estoque e clientes |
| `orders` · `reservations` | pedidos, comandas e reservas |
| `qrmenu` | cardápio por QR e pedidos vindos do QR |
| `delivery` | integração de delivery |
| `reports` | relatórios e faturas |
| `push` | registro de aparelhos para notificações (Expo Push) |
| `realtime` · `queues` | Socket.IO e filas (Bull Board em `/admin/queues`) |
| `blog` · `health` | conteúdo do blog e healthcheck |

Integrações externas ficam em `src/integrations/` (`ai`, `mail`, `storage`, `stripe`).

## Testes

```bash
npm test                # unitários (src/**/*.spec.ts), vitest
npm run test:cov        # unitários com cobertura
npm run test:e2e        # e2e (test/*.e2e-spec.ts) contra o banco do DATABASE_URL (cria e remove um tenant temporário)
```

Os e2e precisam de Redis e de um banco que o usuário do `DATABASE_URL` possa
escrever. Não rode contra produção.

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
