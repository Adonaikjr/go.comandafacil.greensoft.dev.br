import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { STRIPE } from '../../integrations/stripe/stripe.module.js';
import { asDbDateTime, nowAsDbDateTime } from '../../common/utils/db-time.js';

type SubscriptionStatus = 'created' | 'updated' | 'cancelled';

// Status do Stripe que mantêm a loja liberada. `past_due` entra como carência
// enquanto o Stripe tenta cobrar de novo; se as tentativas acabarem, a
// assinatura vira `unpaid`/`canceled` e a loja é bloqueada.
const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
]);

@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(STRIPE) private readonly stripe: Stripe,
  ) {}

  private get isProduction() {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }

  onModuleInit() {
    if (
      this.isProduction &&
      !this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true })
    ) {
      this.logger.error(
        'STRIPE_WEBHOOK_SECRET não configurado: o webhook do Stripe vai recusar todos os eventos.',
      );
    }
  }

  getSubscriptionDetails(tenantId: number) {
    return this.prisma.tenants.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        is_active: true,
        subscription_id: true,
        payment_customer_id: true,
        subscription_start: true,
        subscription_end: true,
        trial_started_at: true,
      },
    });
  }

  async cancelSubscription(subscriptionId: string) {
    await this.stripe.subscriptions.cancel(subscriptionId);
  }

  // Exclusão de conta: a cobrança tem que parar antes de a loja sumir.
  // Assinatura já cancelada ou inexistente no Stripe não impede a exclusão.
  async cancelSubscriptionIfActive(subscriptionId: string) {
    try {
      const subscription =
        await this.stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.status === 'canceled') return;
      await this.stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      if ((error as Stripe.errors.StripeError).code === 'resource_missing') {
        return;
      }
      throw error;
    }
  }

  async createCheckoutSession(
    priceId: string,
    email: string,
    tenantId: number,
  ) {
    const frontend = this.config.get('FRONTEND_DOMAIN', { infer: true });
    const session = await this.stripe.checkout.sessions.create({
      billing_address_collection: 'auto',
      customer_email: email,
      client_reference_id: String(tenantId),
      metadata: { tenant_id: String(tenantId) },
      // O metadata da sessão não passa para a assinatura; é este que chega
      // nos eventos customer.subscription.*
      subscription_data: { metadata: { tenant_id: String(tenantId) } },
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${frontend}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/cancelled-payment`,
    });
    return session.url;
  }

  // Lança erro se a assinatura não bater (o controller responde 400)
  constructEvent(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Stripe.Event {
    const secret = this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true });
    if (!secret) {
      // Sem o segredo não dá para saber se o evento veio do Stripe. Em
      // produção isso liberaria loja sem pagamento, então recusa.
      if (this.isProduction) {
        throw new Error('STRIPE_WEBHOOK_SECRET não configurado');
      }
      return JSON.parse(rawBody?.toString() ?? '{}') as Stripe.Event;
    }
    return this.stripe.webhooks.constructEvent(
      rawBody ?? '',
      signature ?? '',
      secret,
    );
  }

  async handleEvent(event: Stripe.Event) {
    if (!event.type.startsWith('customer.subscription.')) {
      this.logger.log(`Unhandled event type ${event.type}.`);
      return;
    }

    const subscription = event.data.object as Stripe.Subscription;
    // Em versões novas da API o período fica nos itens da assinatura
    const item = subscription.items?.data?.[0];
    const legacy = subscription as unknown as {
      current_period_start?: number;
      current_period_end?: number;
    };
    const start = legacy.current_period_start ?? item?.current_period_start;
    const end = legacy.current_period_end ?? item?.current_period_end;

    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

    const tenantId = await this.resolveTenant(subscription, customerId);
    if (!tenantId) {
      this.logger.warn(
        `Assinatura ${subscription.id} sem loja correspondente (${event.type}).`,
      );
      return;
    }

    const access = {
      start: toDbDate(start),
      end: toDbDate(end),
      subscriptionId: subscription.id,
      customerId,
    };

    switch (event.type) {
      case 'customer.subscription.created':
        return this.updateAccess(
          tenantId,
          ACTIVE_STATUSES.has(subscription.status) ? 1 : 0,
          access,
          'created',
        );
      case 'customer.subscription.updated':
        return this.updateAccess(
          tenantId,
          ACTIVE_STATUSES.has(subscription.status) ? 1 : 0,
          access,
          'updated',
        );
      case 'customer.subscription.deleted':
        return this.updateAccess(tenantId, 0, access, 'cancelled');
      default:
        this.logger.log(
          `Subscription event ${event.type} (${subscription.status}).`,
        );
    }
  }

  // A loja vem do metadata da assinatura (checkouts novos). Para assinaturas
  // antigas, sem metadata, cai no e-mail do cliente no Stripe, como no legado.
  private async resolveTenant(
    subscription: Stripe.Subscription,
    customerId: string,
  ): Promise<number | null> {
    const fromMetadata = Number(subscription.metadata?.tenant_id);
    if (Number.isInteger(fromMetadata) && fromMetadata > 0) {
      const tenant = await this.prisma.tenants.findUnique({
        where: { id: fromMetadata },
        select: { id: true },
      });
      if (tenant) return tenant.id;
    }

    let email: string | null = null;
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      email = customer.deleted ? null : customer.email;
    } catch (error) {
      this.logger.error(error, 'Error getting customer from stripe');
    }
    if (!email) return null;

    const user = await this.prisma.users.findUnique({
      where: { username: email },
      select: { tenant_id: true },
    });
    return user?.tenant_id ?? null;
  }

  private async updateAccess(
    tenantId: number,
    isActive: 0 | 1,
    access: {
      start: Date | null;
      end: Date | null;
      subscriptionId: string;
      customerId: string;
    },
    status: SubscriptionStatus,
  ) {
    await this.prisma.$transaction([
      this.prisma.tenants.update({
        where: { id: tenantId },
        data: {
          is_active: isActive,
          subscription_id: access.subscriptionId,
          payment_customer_id: access.customerId,
          subscription_start: access.start,
          subscription_end: access.end,
        },
      }),
      this.prisma.subscription_history.create({
        data: {
          tenant_id: tenantId,
          created_at: nowAsDbDateTime(),
          starts_on: access.start,
          expires_on: access.end,
          status,
        },
      }),
    ]);
  }
}

// O legado gravava só a data (YYYY-MM-DD) do período da assinatura
function toDbDate(unixSeconds: number | undefined): Date | null {
  if (!unixSeconds) return null;
  const date = asDbDateTime(new Date(unixSeconds * 1000));
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
