# Plano de migração: `backend-legado` (Express/JS) → `backend-new` (NestJS + TypeScript)

## Estrutura do repositório

```
green-food-backend/
  backend-legado/   # Express + JS + mysql2/Prisma 6 (em produção)
  backend-new/      # NestJS 12 limpo (gerado com `nest new`)
  MIGRACAO_NESTJS.md
```

O legado continua em produção até o corte final (Fase 6). Todo o código novo vai para o `backend-new`.

---

## Estado atual do `backend-legado`

- **140 endpoints** em 20 módulos de rotas (`backend-legado/src/routes`).
- O MySQL é acessado de duas formas:
  - SQL direto com `mysql2`, na maior parte dos serviços.
  - **Prisma 6.19**, em blog, iFood e Keeta.
- O `backend-legado/prisma/schema.prisma` já cobre quase todas as tabelas. Só falta `page_visitors`.
- O Socket.IO fica em `backend-legado/index.js`, com uma sala por tenant e os eventos `new_order`, `new_qrorder` e `order_update`.
- Autenticação por JWT em cookie ou `Bearer`, com refresh token, Google OAuth, controle de assinatura (com trial de 14 dias) e escopos de permissão (`src/config/user.config.js`).
- Integrações: Stripe (webhook), iFood (polling), Keeta (em desenvolvimento, com TODOs), Gemini e SMTP.

| Módulo | Rotas |
|---|---|
| settings | 22 |
| menu_item | 17 |
| auth | 14 |
| superadmin | 14 |
| ifood | 9 |
| keeta | 9 |
| orders | 7 |
| pos | 7 |
| reservation | 7 |
| user | 7 |
| customer | 6 |
| blog | 5 |
| gemini | 4 |
| invoice | 4 |
| kitchen | 2 |
| qrmenu | 2 |
| dashboard, reports, sitemap, stripe | 1 cada |

---

## Estado atual do `backend-new`

É um projeto `nest new` sem alterações. Essa versão do scaffold é diferente do que se costuma ver em tutoriais, e isso afeta várias escolhas do plano:

| Item | Valor | Impacto |
|---|---|---|
| NestJS | **12.3** (`@nestjs/core`, `common`, `platform-express`) | Algumas bibliotecas ainda não declaram suporte ao Nest 12 (ver a seção 1) |
| TypeScript | **6.0**, `strict: true`, `strictPropertyInitialization: false` | Pode continuar assim |
| Módulos | **ESM** (`"type": "module"`, `module: nodenext`) | Os imports relativos precisam terminar em `.js`, e as bibliotecas precisam funcionar com ESM |
| Testes | **Vitest 4** (`vitest.config.ts`, `vitest.config.e2e.ts`), não Jest | Os testes usam Vitest |
| Lint | **oxlint** (`oxlint.json`), não ESLint | Continua oxlint, com Prettier já configurado |
| `@nestjs/observe` | Vem no `AppModule` com `appKey: 'YOUR_APP_KEY'` fixo no código | **Remover** (ou configurar pelo env se o serviço pago for contratado). Os logs ficam com `nestjs-pino` |
| `package.json` | `"name": "project-name"` | Renomear para `@greenfood/api` |
| Git | `backend-new/.git` próprio, sem commits | **Remover**: é um repositório dentro de outro, o que quebra o repositório pai |
| `.gitignore` | Não ignora `.env` | Adicionar `.env*` |
| Monorepo | O `package.json` da raiz (`pdv.greensoft.dev.br`) tem nos workspaces `green-food-backend`, que não tem mais `package.json` | Atualizar os workspaces para `green-food-backend/backend-legado` e `green-food-backend/backend-new` |

---

## Estratégia

O `backend-new` usa **o mesmo banco** do legado e mantém **o mesmo contrato da API**:

- prefixo `/api/v1/...`;
- formato de resposta `{ success, message, data }`;
- mesmos cookies e mesmo payload do JWT.

Assim o frontend (`green-food`) não precisa mudar. A troca é feita módulo a módulo com um proxy reverso na frente. A ideia é **não fazer** uma troca única de tudo de uma vez.

**Quem cuida do schema:** a partir da Fase 0, o `backend-new` passa a ser o **único** responsável pelas migrations do Prisma. O legado só roda `prisma generate`, nunca `migrate`.

---

## 1. Stack

As versões abaixo foram conferidas no npm em 01/11/2026 quanto à compatibilidade com Nest 12.

| Necessidade | Biblioteca | Observação |
|---|---|---|
| Framework | `@nestjs/*` 12 | já instalado |
| ORM | `prisma` + `@prisma/client` **7.10.x** + `@prisma/adapter-mariadb` | Usar o generator `prisma-client` (ESM) e o `prisma.config.ts`. **Fixar 7.10.x**: a tag `latest` do pacote `prisma` aponta para `8.0.0-rc` |
| Validação | `zod` **4.x** | **Não usar `nestjs-zod`**: a versão 5.5 só aceita Nest ≤ 11 e Swagger ≤ 11. Criar um `ZodValidationPipe` próprio (poucas linhas) |
| Documentação | `@nestjs/swagger` 12 + `@scalar/nestjs-api-reference` | Os schemas Zod vão para o OpenAPI com `z.toJSONSchema()`, que já vem no Zod 4, por meio de um decorator próprio (`@ZodBody`, `@ZodResponse`) |
| Filas | `bullmq` 5.x + `@nestjs/bullmq` + Redis (`ioredis`) | `@nestjs/bullmq` aceita bullmq até a 6, mas a 6 ainda é recente. Começar pela 5.x |
| Painel das filas | `@bull-board/nestjs` + `@bull-board/api` + `@bull-board/express` | aceita Nest 12 |
| WebSocket | `@nestjs/websockets` + `@nestjs/platform-socket.io` 12 + `@socket.io/redis-adapter` | |
| Configuração | `@nestjs/config` 12, com o env validado por Zod | |
| Contexto por requisição | `nestjs-cls` 7 | tenant atual, request-id |
| Autenticação | `@nestjs/jwt` 12, `@nestjs/passport` 12, `passport-jwt`, `passport-google-oauth20`, `bcrypt` | |
| Segurança | `helmet`, `@nestjs/throttler` 6, `cookie-parser` | |
| Logs | `nestjs-pino` 5 + `pino-http` + `pino-pretty` | substitui o `@nestjs/observe` |
| Agendamento | Repeatable jobs do BullMQ | funcionam com várias instâncias |
| HTTP externo | `@nestjs/axios` 12 | |
| E-mail | `@nestjs-modules/mailer` 4 + `nodemailer` + `handlebars` | |
| Upload | Multer (`@nestjs/platform-express`) + `sharp` | |
| Health check | `@nestjs/terminus` 12 | |
| Datas | `date-fns` + `@date-fns/tz` (`America/Sao_Paulo`) | |
| Outros | `stripe`, `@google/genai` (o pacote antigo `@google/generative-ai` não entra), `nanoid` | |
| Testes | Vitest (já configurado), `supertest`, `testcontainers` (MySQL e Redis reais) | |
| Qualidade | oxlint + Prettier (já configurados), `husky` + `lint-staged` | |
| Infraestrutura | `docker-compose` (MySQL, Redis, API) e Dockerfile multi-stage | |

> Regra: antes de instalar qualquer biblioteca nova, rodar `npm view <pacote> peerDependencies` e conferir se ela aceita `@nestjs/common ^12`. Não usar `--legacy-peer-deps` para contornar a checagem.

---

## 2. Estrutura de pastas do `backend-new`

```
backend-new/
  prisma/
    schema.prisma
    migrations/
  prisma.config.ts
  docker-compose.yml
  .env.example
  src/
    main.ts                  # helmet, cookies, CORS, rawBody (Stripe), Swagger, prefixo /api/v1
    app.module.ts
    generated/prisma/        # saída do generator prisma-client (fica no .gitignore)
    config/                  # env.schema.ts (Zod) + ConfigModule
    prisma/                  # PrismaService (global, adapter-mariadb) + extensão de multi-tenant
    common/
      guards/                # JwtAuthGuard, SubscriptionGuard, ScopesGuard, RolesGuard, SuperAdminGuard
      decorators/            # @CurrentUser(), @TenantId(), @Scopes(), @Public(), @ZodBody(), @ZodResponse()
      interceptors/          # ResponseInterceptor → { success, message, data }
      filters/               # exception filter global (Prisma/Zod → HTTP)
      pipes/                 # ZodValidationPipe
    modules/
      auth/  users/  settings/  customers/  reservations/
      menu/  pos/  kitchen/  orders/  invoices/  qrmenu/
      dashboard/  reports/  superadmin/  billing/
      blog/  sitemap/  ai/
      integrations/ifood/  integrations/keeta/
      realtime/              # OrdersGateway (socket.io)
      queues/                # registro das filas + bull-board
      mail/  storage/
  test/                      # e2e (vitest.config.e2e.ts)
```

Cada módulo contém:

- `*.module.ts`
- `*.controller.ts`
- `*.service.ts`
- `dto/*.schema.ts` (Zod)
- `*.spec.ts` (Vitest)

**Como cada parte do legado vira código Nest:**

| Legado (`backend-legado/src`) | Novo (`backend-new/src`) |
|---|---|
| `routes/x.routes.js` + `controllers/x.controller.js` | `modules/x/x.controller.ts` |
| `services/x.service.js` (funções `...DB`) | `modules/x/x.service.ts` (Prisma) |
| `middlewares/auth.middleware.js` | `common/guards/*` |
| `config/index.js` | `config/env.schema.ts` |
| `config/user.config.js` (ROLES/SCOPES) | `common/enums/` |
| `config/mailTransport.js` | `modules/mail/` |
| `agents/gemini.*.js` | `modules/ai/` |
| `utils/jwt.js`, `utils/googleOAuth.js` | `modules/auth/` |
| `utils/clear_sequence_tokens.js` | job da fila `maintenance` |
| `index.js` (socket.io) | `modules/realtime/orders.gateway.ts` |
| `migrations/*.sql` | `prisma/migrations/` |
| `public/` (uploads) | `modules/storage/` + `ServeStaticModule`, ou o mesmo diretório montado como volume |

---

## 3. Fases

### Fase 0: Fundação (cerca de 1 semana)

**0.1 Limpar o scaffold**

1. Apagar a pasta `backend-new/.git`.
2. Renomear o pacote para `@greenfood/api`.
3. Adicionar `.env*` (com exceção de `.env.example`) e `src/generated/` ao `.gitignore`.
4. Remover o `@nestjs/observe`, tanto do `AppModule` e do `main.ts` quanto das dependências.
5. Remover `AppController` e `AppService`, que são só de exemplo.
6. Atualizar os workspaces no `package.json` da raiz do monorepo e conferir se o `turbo run dev` sobe os dois backends.
7. Criar o `docker-compose.yml` com MySQL 8 e Redis 7, e o `.env.example` baseado em `backend-legado/src/config/index.js`.

**0.2 Prisma 7**

1. Instalar `prisma@7.10` e `@prisma/client@7.10`. Configurar o `prisma.config.ts` e o generator `prisma-client` com `output = "../src/generated/prisma"`.
2. Gerar o schema completo a partir do banco real, incluindo `page_visitors`:
   1. Rodar `prisma db pull` contra uma cópia do banco de produção.
   2. Comparar o resultado com `backend-legado/prisma/schema.prisma`.
   3. Marcar o estado atual como baseline com `prisma migrate resolve --applied 0_init`.
   4. Converter os `.sql` de `backend-legado/src/migrations/` em migrations do Prisma.
3. Criar o `PrismaService` com `@prisma/adapter-mariadb`, injetado de forma global.
4. Criar a **extensão Prisma de multi-tenant**. Ela lê o `tenantId` do `nestjs-cls` e o aplica automaticamente nas queries dos modelos que têm `tenant_id`.

**0.3 Infraestrutura comum**

1. Validar o env com Zod no `ConfigModule`. A aplicação não sobe se faltar `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, `STRIPE_*` etc.
2. Criar o `ZodValidationPipe` e os decorators `@ZodBody` e `@ZodResponse` (Zod 4 → `z.toJSONSchema()` → Swagger).
3. Criar o `ResponseInterceptor` e o exception filter global, compatíveis com o formato atual.
4. Configurar o `main.ts`:
   - `rawBody: true` (para o Stripe);
   - `helmet` e `cookie-parser`;
   - CORS com a mesma whitelist do legado;
   - `setGlobalPrefix('api/v1')`.
5. Configurar `nestjs-pino`, `@nestjs/throttler` e `@nestjs/terminus` (`/health`).
6. Publicar a documentação Swagger e Scalar em `/docs`.
7. Criar um módulo de exemplo, `customers` (6 rotas, sem dependências), já com teste unitário e teste e2e. Ele serve de referência para todos os outros módulos.

### Fase 1: Autenticação e acesso (cerca de 1 semana)

- **Fluxos:** login, refresh, logout, recuperação de senha e Google OAuth, com os mesmos nomes de cookie e o mesmo payload do JWT. Assim os tokens emitidos pelo legado continuam válidos durante a convivência.
- **Guards:**
  - `JwtAuthGuard`: global, com `@Public()` para as rotas abertas;
  - `SubscriptionGuard`: assinatura ativa ou trial de 14 dias;
  - `ScopesGuard`: usado como `@Scopes(Scope.POS)`, com um enum TS baseado em `backend-legado/src/config/user.config.js`;
  - `SuperAdminGuard`.
- **Ajuste de segurança:** o access token não deve ser registrado em log. Hoje `auth.middleware.js` faz isso.

### Fase 2: Domínio principal (2 a 3 semanas)

A ordem segue as dependências entre os módulos:

1. `settings`: loja, mesas, impostos, formas de pagamento, impressão.
2. `menu`: categorias, itens, variações, adicionais, upload com sharp.
3. `reservations`, `users` (`customers` já fica pronto na Fase 0).
4. **`pos`, `orders`, `kitchen`, `invoices`**: é a parte mais delicada.
   - O `SELECT ... FOR UPDATE` atual vira `prisma.$transaction` interativa, com `$queryRaw` onde o lock for necessário.
   - Isso vale para a senha diária (`token_sequences`) e para a numeração de faturas (`invoice_sequences`).
   - Cada uma precisa de um teste de concorrência no Vitest, com testcontainers.
5. `qrmenu` (rotas públicas).
6. `dashboard` e `reports`: as queries agregadas continuam como `$queryRaw` tipado (`Prisma.sql`), ou vão para TypedSQL (`prisma/sql/*.sql`).

### Fase 3: Tempo real (cerca de 3 dias)

- **Autenticação do socket:** o `OrdersGateway` passa a validar o **JWT no handshake**. Hoje o cliente envia apenas o `tenantId` no evento `authenticate`, e com isso qualquer pessoa consegue entrar na sala de qualquer restaurante.
- **Quem emite os eventos:** passa a ser o próprio serviço, logo depois de salvar o pedido:

  ```ts
  this.gateway.emitToTenant(tenantId, 'new_order', payload)
  ```

  Os eventos `*_backend` emitidos pelo frontend continuam aceitos por um tempo, para manter a compatibilidade.
- **Escala:** o Redis adapter permite rodar várias instâncias da API.

### Fase 4: Filas com BullMQ (cerca de 1 semana)

| Fila | Uso |
|---|---|
| `ifood-polling` | Job repetitivo a cada 30 s por tenant com integração ativa. Faz o acknowledgment dos eventos e emite pelo WebSocket |
| `keeta-sync` | Mesma lógica para a Keeta |
| `stripe-events` | O webhook só valida a assinatura, coloca o evento na fila e responde 200. O processamento é idempotente pelo `event.id` |
| `mail` | E-mails de recuperação de senha, boas-vindas etc., com retry e backoff |
| `ai-content` | Geração de textos e imagens pelo Gemini, fora do ciclo da requisição |
| `images` | Processamento de imagens com sharp |
| `maintenance` | Limpar tokens expirados (substitui `backend-legado/src/utils/clear_sequence_tokens.js`) e verificar fim de trial e assinaturas |

- **Painel:** Bull Board em `/admin/queues`, protegido pelo `SuperAdminGuard` (ou basic auth).
- **Falhas:** configurar `attempts`, `backoff` exponencial e uma fila de falhas.

### Fase 5: Restante (cerca de 1 semana)

- `superadmin`.
- `billing`: Stripe, usando o `rawBody` já habilitado no `main.ts`.
- `blog`, `sitemap`, `ai`.
- Integrações iFood e Keeta, com as credenciais criptografadas usando `ENCRYPTION_KEY`.

### Fase 6: Corte e desligamento (cerca de 1 semana)

1. Colocar um proxy reverso (Nginx ou Caddy) na frente e direcionar as rotas para o `backend-new` **módulo a módulo**, conforme cada um for validado. As rotas que ainda não migraram continuam indo para o `backend-legado`.
2. Rodar testes e2e que comparam as respostas dos dois backends nas rotas críticas.
3. Desligar o `backend-legado`, remover a pasta e tirá-la dos workspaces do monorepo.

**Estimativa total:** 8 a 10 semanas para uma pessoa em tempo integral. Com as Fases 0 e 1 prontas, os módulos podem ser divididos entre várias pessoas.

---

## 4. Decisões e riscos

- **Nest 12 é recente:** parte das bibliotecas ainda não declara suporte. `nestjs-zod` foi substituído por um pipe próprio. Qualquer biblioteca nova passa pela checagem de `peerDependencies`.
- **ESM:** os imports relativos precisam terminar em `.js`. Bibliotecas que só funcionam com CommonJS são usadas por `import` default e precisam de teste.
- **Prisma 7 com o legado no 6:** os dois usam o mesmo banco sem conflito, porque apenas o `backend-new` roda migrations. O client 6 do legado só precisa de `prisma generate` quando o schema mudar.
- **SQL direto → Prisma:** os CRUDs passam para o ORM. Relatórios e locks ficam em `$queryRaw` tipado ou TypedSQL.
- **Multi-tenant:** a extensão Prisma com CLS evita vazar dados entre restaurantes por esquecimento de `WHERE tenant_id`.
- **Datas:** hoje o legado usa `dateStrings=true` e compara datas com `toISOString()`, que é UTC. Por isso a senha diária pode zerar no horário errado no Brasil. A correção é padronizar o fuso em `America/Sao_Paulo`.
- **Contrato da API:** gerar a especificação OpenAPI. Como passo opcional, criar um client tipado para o frontend com `orval` ou `openapi-typescript`.
- **Infraestrutura:** o Redis passa a ser uma dependência obrigatória em produção.
- **Segredos:** o `.env` do legado continua em `backend-legado/.env`. O `backend-new` usa o seu próprio `.env`, que fica de fora do Git, e um `.env.example` versionado.
- **Evolução:** manter o contrato `/api/v1` durante a migração. Mudanças de rotas e respostas (REST mais limpo, paginação padronizada) ficam para uma futura `/api/v2`.

---

## 5. Checklist

- [ ] 0.1 Limpar o scaffold (`.git` interno, nome do pacote, `.gitignore`, Observe, workspaces, docker-compose)
- [ ] 0.2 Prisma 7 (baseline, adapter-mariadb, multi-tenant)
- [ ] 0.3 Infraestrutura comum (env, Zod pipe, interceptor, filter, pino, throttler, health, Swagger) + módulo `customers` de referência
- [ ] Fase 1: auth, guards e escopos
- [ ] Fase 2: settings, menu, reservations, users
- [ ] Fase 2: pos, orders, kitchen, invoices (com testes de concorrência)
- [ ] Fase 2: qrmenu, dashboard, reports
- [ ] Fase 3: gateway WebSocket autenticado + Redis adapter
- [ ] Fase 4: filas BullMQ + Bull Board
- [ ] Fase 5: superadmin, billing, blog, sitemap, ai, iFood, Keeta
- [ ] Fase 6: proxy, testes comparativos, desligamento do legado
