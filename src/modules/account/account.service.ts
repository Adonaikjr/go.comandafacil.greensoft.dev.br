import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../integrations/storage/storage.service.js';
import { BillingService } from '../billing/billing.service.js';

// Exclusão de conta exigida pela Google Play: o dono apaga a loja inteira.
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly storage: StorageService,
  ) {}

  async deleteTenant(tenantId: number, username: string, password?: string) {
    const user = await this.prisma.users.findFirst({
      where: { username, tenant_id: tenantId },
      select: { password: true },
    });
    if (!user) throw new NotFoundException('Conta não encontrada.');

    // Conta do Google não tem senha (password = ''): vale só a confirmação
    if (user.password) {
      if (!password) throw new BadRequestException('Informe sua senha.');
      if (!(await bcrypt.compare(password, user.password))) {
        throw new BadRequestException('Senha incorreta.');
      }
    }

    const superadmin = await this.prisma.superadmins.findUnique({
      where: { email: username },
      select: { email: true },
    });
    if (superadmin) {
      throw new ForbiddenException(
        'A conta de um superadmin não pode ser excluída por aqui.',
      );
    }

    const tenant = await this.prisma.tenants.findUnique({
      where: { id: tenantId },
      select: { subscription_id: true },
    });
    if (tenant?.subscription_id) {
      try {
        await this.billing.cancelSubscriptionIfActive(tenant.subscription_id);
      } catch (error) {
        this.logger.error(error);
        throw new BadGatewayException(
          'Não foi possível cancelar a assinatura agora. Nada foi excluído; tente de novo em instantes.',
        );
      }
    }

    const usernames = (
      await this.prisma.users.findMany({
        where: { tenant_id: tenantId },
        select: { username: true },
      })
    ).map((u) => u.username);

    // O resto sai pelo ON DELETE CASCADE de tenants. qr_orders/qr_order_items
    // e as tabelas do iFood não têm FK com cascade no schema herdado.
    await this.prisma.$transaction([
      this.prisma.qr_order_items.deleteMany({ where: { tenant_id: tenantId } }),
      this.prisma.qr_orders.deleteMany({ where: { tenant_id: tenantId } }),
      this.prisma.ifood_auth_tokens.deleteMany({
        where: { tenant_id: tenantId },
      }),
      this.prisma.ifood_catalog_mapping.deleteMany({
        where: { tenant_id: tenantId },
      }),
      this.prisma.reset_password_tokens.deleteMany({
        where: { username: { in: usernames } },
      }),
      this.prisma.tenants.delete({ where: { id: tenantId } }),
    ]);

    // Depois do banco: se apagar os arquivos falhar, a conta já não existe
    // e as imagens órfãs não identificam ninguém sem o cadastro.
    try {
      await this.storage.removeTenantFiles(tenantId);
    } catch (error) {
      this.logger.warn(
        `Arquivos da loja ${tenantId} não foram removidos: ${(error as Error).message}`,
      );
    }
    this.logger.log(`Loja ${tenantId} excluída a pedido do dono.`);
  }
}
