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

O `backend-new` mantém **o mesmo contrato da API** do legado:

- prefixo `/api/v1/...`;
- **as mesmas respostas, campo a campo**. O legado não tem um envelope único: listagens devolvem o objeto direto (por exemplo `{ customers, currentPage, ... }`), ações devolvem `{ success, message }` e erros devolvem `{ success: false, message }`. Datas saem como texto (`"2026-11-01"` / `"2026-11-01 14:30:00"`) e booleanos de `TINYINT` como `0`/`1`;
- mesmos cookies e mesmo payload do JWT.

Assim o frontend (`green-food`) não precisa mudar.

**Bancos separados:** o `backend-new` usa um banco próprio (`comanda-facil` em `dev-db.greensoft.dev.br`), e o legado continua no banco `pdv`. O schema do banco novo começou como cópia exata do schema do `pdv` (migration `0_init`). Com isso:

- as migrations do Prisma ficam só no `backend-new`;
- não dá para dividir as rotas entre os dois backends em produção, porque cada um gravaria num banco. O corte (Fase 6) é feito de uma vez, com uma **migração de dados** do `pdv` para o banco novo;
- até lá, o `backend-new` é validado em dev/homologação, apontando o frontend para ele.

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
    prisma/                  # PrismaService (global, adapter-mariadb)
    common/
      guards/                # JwtAuthGuard, SubscriptionGuard, ScopesGuard, RolesGuard, SuperAdminGuard
      decorators/            # @CurrentUser(), @TenantId(), @Scopes(), @Public(), @ZodBody(), @ZodResponse()
      utils/                 # formatação no padrão do legado (datas, 0/1)
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

> **Status (01/11/2026): concluída**, com exceção dos itens marcados como pendentes.

**0.1 Limpar o scaffold**

1. ✅ Apagar a pasta `backend-new/.git`. *Mudou:* o `backend-new` passou a ser um repositório próprio (`Adonaikjr/go.comandafacil.greensoft.dev.br`), então o `.git` foi mantido.
2. ✅ Renomear o pacote para `@greenfood/api`.
3. ✅ Adicionar `.env*` (com exceção de `.env.example`) e `src/generated/` ao `.gitignore`.
4. ✅ Remover o `@nestjs/observe` e o `@nestjs/mau`.
5. ✅ Remover `AppController` e `AppService`.
6. ⏳ Atualizar os workspaces no `package.json` da raiz do monorepo (`pdv.greensoft.dev.br`). Pendente: esse arquivo é de outro repositório.
7. ✅ Criar o `docker-compose.yml` (Redis; MySQL local opcional com `--profile local-db`) e o `.env.example`.

**0.2 Prisma 7**

1. ✅ `prisma`, `@prisma/client` e `@prisma/adapter-mariadb` fixados em 7.10.1, com `prisma.config.ts` e o generator `prisma-client` (ESM) gerando em `src/generated/prisma`.
2. ✅ Schema criado a partir do banco real:
   1. Schema (sem dados) exportado do banco `pdv` com `mysqldump --no-data`. Ele já inclui `page_visitors`, `plan_type` e `trial_started_at`, então os `.sql` de `backend-legado/src/migrations/` não precisam ser convertidos.
   2. Esse dump virou a migration `0_init`, aplicada no banco novo. Em seguida, `prisma db pull` gerou o `schema.prisma`.
   3. Migration `1_store_details_pk_keeta`: `store_details.tenant_id` passou a ser chave primária (antes a tabela ficava fora do Prisma, com `@@ignore`), e foram criadas `keeta_credentials` e `keeta_orders`, que ainda não existiam no `pdv`.
   4. Diferenças encontradas entre o `schema.prisma` do legado e o banco real: no banco, `ifood_credentials.tenant_id` e `ifood_orders.tenant_id` são `VARCHAR` e não têm FK, e existem as tabelas `ifood_auth_tokens` e `ifood_catalog_mapping`. Isso foi mantido igual ao banco e deve ser corrigido na Fase 5.
3. ✅ `PrismaService` global com `@prisma/adapter-mariadb`.
4. ⏳ **Extensão Prisma de multi-tenant: adiada.** Várias tabelas têm chave composta com `tenant_id` (`customers`, `invoices`), e a extensão não cobre `findUnique`/`update` por chave composta. Por enquanto, os services recebem o `tenantId` (decorator `@TenantId()`) e o filtram explicitamente. O `nestjs-cls` já guarda o `tenantId` e o `username` da requisição, para quando a extensão for feita.

**0.3 Infraestrutura comum**

1. ✅ Env validado com Zod (`src/config/env.schema.ts`).
2. ✅ `ZodValidationPipe` e os decorators `@ZodBody`, `@ZodQuery` e `@ZodResponse` (Zod 4 → `z.toJSONSchema({ target: 'openapi-3.0' })` → Swagger).
3. ✅ Exception filter global (`{ success: false, message }`). *Mudou:* **não existe `ResponseInterceptor`**, porque o legado não usa um envelope único. Cada controller devolve exatamente o formato da rota antiga.
4. ✅ `main.ts`: `rawBody`, `helmet`, `cookie-parser`, CORS (`FRONTEND_DOMAIN` + `CORS_EXTRA_ORIGINS`), prefixo `api/v1` (sem prefixo: `/health` e `/sitemap.xml`).
5. ✅ `nestjs-pino` (redige `authorization` e `cookie`), `@nestjs/throttler` (1000 req/min) e `@nestjs/terminus` (`/health`, com ping no banco).
6. ✅ Swagger em `/docs` (JSON em `/docs/json`) e Scalar em `/reference`.
7. ✅ Módulo `customers` com as 6 rotas do legado, testes e2e (`test/customers.e2e-spec.ts`) e testes unitários do guard e do pipe.

**Adiantado da Fase 1:** os guards globais `JwtAuthGuard`, `SubscriptionGuard` e `ScopesGuard` e os decorators `@Public()`, `@SkipSubscription()`, `@Scopes()`, `@CurrentUser()` e `@TenantId()` já estão prontos. Eles aceitam os tokens emitidos pelo legado (mesmo `JWT_SECRET` e mesmo `issuer`).

### Fase 1: Autenticação e acesso (cerca de 1 semana)

- **Fluxos:** login, refresh, logout, recuperação de senha e Google OAuth, com os mesmos nomes de cookie e o mesmo payload do JWT.
- **Guards:** ✅ `JwtAuthGuard`, ✅ `SubscriptionGuard` e ✅ `ScopesGuard` (feitos na Fase 0). Falta o `SuperAdminGuard`.
- **Ajuste de segurança:** ✅ o access token não é registrado em log.

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
- Integrações iFood e Keeta, com as credenciais criptografadas usando `ENCRYPTION_KEY`. Corrigir `ifood_credentials.tenant_id` e `ifood_orders.tenant_id` para `INT` com FK para `tenants`.

### Fase 6: Corte e desligamento (cerca de 1 semana)

Como os bancos são separados, o corte é feito de uma vez:

1. Rodar testes e2e que comparam as respostas dos dois backends nas rotas críticas (cada um no seu banco, com os mesmos dados de teste).
2. Preparar e ensaiar o **script de migração de dados** `pdv` → `comanda-facil`:
   - copiar as tabelas na ordem das FKs, mantendo os IDs e os valores de `AUTO_INCREMENT`;
   - converter `ifood_*.tenant_id` de `VARCHAR` para `INT`;
   - tratar as linhas de `store_details` com `tenant_id` nulo, que deixaram de ser aceitas.
3. Na janela de manutenção:
   1. Colocar o legado em modo somente leitura.
   2. Rodar a migração de dados e conferir a contagem de linhas por tabela.
   3. Apontar o domínio da API e o webhook do Stripe para o `backend-new`.
4. Manter o legado parado (sem apagar) por algumas semanas como plano de volta. Depois, remover a pasta.

**Estimativa total:** 8 a 10 semanas para uma pessoa em tempo integral. Com as Fases 0 e 1 prontas, os módulos podem ser divididos entre várias pessoas.

---

## 4. Decisões e riscos

- **Nest 12 é recente:** parte das bibliotecas ainda não declara suporte. `nestjs-zod` foi substituído por um pipe próprio. Qualquer biblioteca nova passa pela checagem de `peerDependencies`.
- **ESM:** os imports relativos precisam terminar em `.js`. Bibliotecas que só funcionam com CommonJS são usadas por `import` default e precisam de teste.
- **Bancos separados:** o legado (`pdv`) e o novo (`comanda-facil`) não compartilham dados. Mudanças de schema feitas no `pdv` durante a migração precisam ser repetidas como migration no `backend-new`, senão a migração de dados da Fase 6 quebra.
- **Banco de dev remoto:** cada query leva centenas de milissegundos, e os testes e2e demoram cerca de 25 s. Se isso atrapalhar, usar o MySQL local do `docker-compose` (`--profile local-db`).
- **`prisma migrate dev`:** não funciona, porque o usuário do banco de dev não tem permissão para criar o shadow database. As migrations são geradas com `prisma migrate diff` (ver o README).
- **SQL direto → Prisma:** os CRUDs passam para o ORM. Relatórios e locks ficam em `$queryRaw` tipado ou TypedSQL.
- **Multi-tenant:** por enquanto o `tenant_id` é filtrado explicitamente em cada service. A extensão Prisma com CLS (que evita esquecer o `WHERE tenant_id`) fica para depois. Até lá, todo teste e2e precisa verificar que um tenant não enxerga os dados de outro.
- **Datas:** hoje o legado usa `dateStrings=true` e compara datas com `toISOString()`, que é UTC. Por isso a senha diária pode zerar no horário errado no Brasil. A correção é padronizar o fuso em `America/Sao_Paulo`.
- **Contrato da API:** gerar a especificação OpenAPI. Como passo opcional, criar um client tipado para o frontend com `orval` ou `openapi-typescript`.
- **Infraestrutura:** o Redis passa a ser uma dependência obrigatória em produção.
- **Segredos:** o `.env` do legado continua em `backend-legado/.env`. O `backend-new` usa o seu próprio `.env`, que fica de fora do Git, e um `.env.example` versionado.
- **Evolução:** manter o contrato `/api/v1` durante a migração. Mudanças de rotas e respostas (REST mais limpo, paginação padronizada) ficam para uma futura `/api/v2`.

---

## 5. Checklist

- [x] 0.1 Limpar o scaffold (nome do pacote, `.gitignore`, Observe, docker-compose, `.env.example`)
- [ ] 0.1 Workspaces do monorepo raiz (outro repositório)
- [x] 0.2 Prisma 7 (migrations `0_init`, `1_store_details_pk_keeta`, `2_ifood_tenant_int_fk`)
- [ ] 0.2 Extensão de multi-tenant (adiada; `tenant_id` filtrado em cada service)
- [x] 0.3 Infraestrutura comum + módulo `customers`
- [x] Fase 1: auth completa, guards, escopos e `SuperAdminGuard`
- [x] Fase 2: settings, menu, reservations, users
- [x] Fase 2: pos, orders, kitchen, invoices
- [x] Fase 2: qrmenu, dashboard, reports
- [x] Fase 3: gateway WebSocket autenticado + Redis adapter
- [x] Fase 4: filas BullMQ + Bull Board
- [x] Fase 5: superadmin, billing, blog, sitemap, Gemini, iFood, Keeta
- [x] Fase 6: script de migração de dados (ensaiado)
- [ ] Fase 6: corte (executar a migração de dados e apontar o domínio/webhook para o backend-new)

---

## 6. Resultado da migração de código (01/11/2026)

**Cobertura:** as 136 rotas montadas no `app.js` do legado existem no `backend-new`, com os mesmos caminhos, verbos e formatos de resposta. A única exceção é `POST /api/v1/blog/sample-data`, uma rota pública de desenvolvimento que criava posts de exemplo e foi removida de propósito. A rota `stripe.routes.js` do legado não era montada no `app.js` e também não foi migrada.

**Testes:** 17 testes unitários e 30 testes e2e (12 arquivos) contra o banco de dev, cobrindo todos os módulos.

**Mudanças de comportamento em relação ao legado.** São correções de segurança ou de bugs; o formato das respostas não mudou:

| Onde | Legado | Novo |
|---|---|---|
| `/users/*` (exceto `scopes` e `profile/photo`) | Qualquer usuário logado criava, editava e removia usuários | Só admin do tenant |
| `/users/update/:id` | Apagava a foto do usuário | Mantém a foto |
| `/blog/create` | Qualquer usuário logado de restaurante publicava no blog do site | Só superadmin |
| `GET /gemini` | Público: qualquer pessoa disparava geração (e custo) no Gemini | Só superadmin; geração periódica via `BLOG_AI_CRON` |
| `/kitchen/:id`, `/invoices/orders` | Não filtravam por tenant | Filtram por tenant |
| Joins com `customers` | Sem filtro de tenant (pedido duplicado se o telefone existisse em outro restaurante) | Com filtro de tenant |
| `/customers` (`filter`) | SQL injection | Parâmetros via Prisma |
| `/auth/reset-password/:token` | O token continuava válido depois do uso | O token é apagado |
| `/menu-items/update/:id/remove-photo` | Erro 500 (caminho do arquivo sem extensão) | Remove a imagem `.webp` |
| `GET /menu-items/addons` e `/variants` | Inacessíveis (capturadas por `GET /:id`) | Funcionam |
| `/blog/sitemap.xml` | Erro 500 (campos inexistentes) | Funciona |
| QR menu (`place-order`) | Procurava o cliente pelo telefone em todos os tenants | Procura no tenant do QR code |
| Webhook Stripe | Processado na própria requisição | Validado e enfileirado; reenvios não duplicam |
| Senha diária do POS | Virava o dia em UTC | Vira o dia no horário de São Paulo |
| Credenciais iFood/Keeta | `client_secret` em texto puro | Criptografado (AES-256-GCM); valores antigos continuam legíveis |

**Convenção de datas:** a sessão MySQL roda com `time_zone = '-03:00'` e as colunas `DATETIME` guardam o horário de São Paulo (`src/common/utils/db-time.ts`). O banco `pdv` usa o horário do servidor (UTC+1). Na migração de dados é preciso subtrair 4 horas das colunas `DATETIME`/`TIMESTAMP` (exceto as colunas `DATE`).

**Pendências antes do corte:**

1. **Frontend e Socket.IO.** ✅ (03/11/2026) O web (`withCredentials`) e o app (`auth.token`) já mandam o JWT no handshake. Os padrões passaram a ser `SOCKET_LEGACY_AUTH=false` e `REALTIME_SERVER_EVENTS=true`: o socket só entra na sala do próprio tenant e o backend emite `new_order`, `new_qrorder` e `order_update` (inclusive pedidos importados do iFood e o fechamento de conta). Os eventos `*_backend` que os clientes ainda mandam são ignorados. **No `.env` da VPS, remover `SOCKET_LEGACY_AUTH=true`/`REALTIME_SERVER_EVENTS=false` se estiverem lá.**
2. **Keeta.** Os endpoints da API continuam os placeholders do legado. É preciso conferir na documentação oficial (`KEETA_API_BASE` e os caminhos em `keeta.provider.ts`).
3. **Migração de dados** `pdv` → `comanda-facil` (Fase 6): script pronto em `scripts/migrate-legacy-data.ts` (`npm run data:migrate-legacy`). Ele converte o fuso, transforma `ifood_*.tenant_id` em `INT` e descarta `store_details` sem `tenant_id`. Sem `--execute`, só simula. Ensaio feito em 01/11/2026 num MySQL local: as 33 tabelas copiadas, contagens iguais às da origem, datas deslocadas de UTC+1 para São Paulo (−4 h) e nenhuma linha órfã. No dia do corte:
   ```bash
   LEGACY_DATABASE_URL="mysql://…/pdv" LEGACY_TZ="Europe/Paris" npm run data:migrate-legacy -- --execute --truncate
   ```
   `LEGACY_TZ` é o fuso do servidor do banco legado (hoje UTC+1); confirme o fuso exato com quem administra o servidor para tratar o horário de verão. `--truncate` apaga os dados de teste do destino.
4. **Chaves.** Trocar no `.env` de dev as chaves reais do Stripe e do SMTP por chaves de teste. Em produção, configurar `STRIPE_WEBHOOK_SECRET`: sem ele o webhook recusa todos os eventos (antes aceitava evento sem assinatura, o que permitia liberar loja sem pagar).
5. **Datas gravadas pelo Prisma (corrigido em 03/11/2026).** Os campos com `@default(now())` eram preenchidos pelo Prisma Client em UTC, 3 h à frente da convenção do banco. Pedido feito depois das 21 h caía no dia seguinte no dashboard e nos relatórios. Agora o default é do MySQL (`dbgenerated("CURRENT_TIMESTAMP")`, migration `9_db_generated_timestamps`, sem mudança real de DDL). As linhas já gravadas no `comanda-facil` antes da correção continuam 3 h adiantadas; se for preciso, corrigir com um `UPDATE` pontual (as que vierem da migração de dados do legado não são afetadas).
