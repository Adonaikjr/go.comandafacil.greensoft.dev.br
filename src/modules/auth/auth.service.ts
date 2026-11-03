import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MailService } from '../../integrations/mail/mail.service.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { Role } from '../../common/enums/role.enum.js';
import { toSqlDateTime } from '../../common/utils/legacy-format.js';
import {
  asDbDateTime,
  nowAsDbDateTime,
  todayAsDbDate,
} from '../../common/utils/db-time.js';

export interface DeviceInfo {
  ip: string | undefined;
  name: string;
}

// Mesmos campos do SELECT de signInDB/getUserDB do legado (sem a senha)
const userWithTenant = {
  username: true,
  name: true,
  role: true,
  photo: true,
  designation: true,
  phone: true,
  email: true,
  scope: true,
  tenant_id: true,
  tenants: {
    select: { is_active: true, trial_started_at: true, plan_type: true },
  },
} as const;

export type AuthUser = Awaited<ReturnType<AuthService['findUser']>>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get salt() {
    return this.config.get('PASSWORD_SALT', { infer: true });
  }

  async findUser(username: string, tenantId?: number) {
    const user = await this.prisma.users.findFirst({
      where: {
        username,
        ...(tenantId !== undefined && { tenant_id: tenantId }),
      },
      select: userWithTenant,
    });
    if (!user) return null;

    const { tenants, ...rest } = user;
    return {
      ...rest,
      is_active: tenants?.is_active ?? null,
      trial_started_at: toSqlDateTime(tenants?.trial_started_at),
      plan_type: tenants?.plan_type ?? null,
    };
  }

  toPayload(user: NonNullable<AuthUser>): JwtPayload {
    return {
      tenant_id: user.tenant_id!,
      username: user.username,
      name: user.name,
      role: user.role as Role,
      scope: user.scope,
      is_active: user.is_active,
      trial_started_at: user.trial_started_at || null,
      plan_type: user.plan_type || 'basic',
    };
  }

  async validateCredentials(username: string, password: string) {
    const credentials = await this.prisma.users.findUnique({
      where: { username },
      select: { password: true },
    });
    if (!credentials) return null;

    const matches = await bcrypt.compare(password, credentials.password);
    return matches ? this.findUser(username) : null;
  }

  async signUp(bizName: string, username: string, password: string) {
    const exists = await this.prisma.users.findUnique({
      where: { username },
      select: { username: true },
    });
    if (exists) {
      throw new BadRequestException(
        'Já existe uma conta com este e-mail! Tente fazer login!',
      );
    }

    const hash = await bcrypt.hash(password, this.salt);
    await this.createTenantWithAdmin(bizName, {
      username,
      password: hash,
      name: bizName,
    });
  }

  private createTenantWithAdmin(
    tenantName: string | null,
    user: {
      username: string;
      password: string;
      name: string | null;
      photo?: string | null;
    },
  ) {
    return this.prisma.tenants.create({
      data: {
        name: tenantName,
        is_active: 0,
        trial_started_at: nowAsDbDateTime(),
        users: { create: { ...user, role: Role.ADMIN } },
      },
    });
  }

  async saveRefreshToken(
    user: NonNullable<AuthUser>,
    refreshToken: string,
    expiry: Date,
    device: DeviceInfo,
  ) {
    await this.prisma.refresh_tokens.create({
      data: {
        username: user.username,
        refresh_token: refreshToken,
        expiry: asDbDateTime(expiry),
        device_ip: device.ip,
        device_name: device.name,
        device_location: '',
        tenant_id: user.tenant_id,
      },
    });
  }

  async removeRefreshToken(username: string, refreshToken: string | undefined) {
    await this.prisma.$transaction([
      this.prisma.refresh_tokens.deleteMany({
        where: { username, refresh_token: refreshToken ?? '' },
      }),
      this.deleteExpiredTokens(username),
    ]);
  }

  async removeDevice(username: string, deviceId: number) {
    await this.prisma.$transaction([
      this.prisma.refresh_tokens.deleteMany({
        where: { username, device_id: deviceId },
      }),
      this.deleteExpiredTokens(username),
    ]);
  }

  private deleteExpiredTokens(username: string) {
    return this.prisma.refresh_tokens.deleteMany({
      where: { username, expiry: { lt: todayAsDbDate() } },
    });
  }

  async refreshTokenExists(refreshToken: string) {
    const token = await this.prisma.refresh_tokens.findFirst({
      where: { refresh_token: refreshToken },
      select: { username: true },
    });
    return !!token;
  }

  async getDevices(username: string, currentRefreshToken: string | undefined) {
    const devices = await this.prisma.refresh_tokens.findMany({
      where: { username },
      select: {
        device_id: true,
        refresh_token: true,
        device_ip: true,
        device_name: true,
        device_location: true,
        created_at: true,
      },
    });
    // O refresh_token de cada aparelho nao sai daqui: devolve-lo deixava
    // quem tivesse um access token assumir as outras sessoes.
    return devices.map(({ refresh_token, ...device }) => ({
      ...device,
      isMyDevice:
        currentRefreshToken != null && refresh_token == currentRefreshToken,
    }));
  }

  async forgotPassword(username: string) {
    const exists = await this.prisma.users.findUnique({
      where: { username },
      select: { username: true },
    });
    if (!exists) return;

    const token = randomBytes(20).toString('hex');
    const data = {
      reset_token: sha256(token),
      expires_at: asDbDateTime(new Date(Date.now() + 20 * 60 * 1000)),
    };
    await this.prisma.reset_password_tokens.upsert({
      where: { username },
      create: { username, ...data },
      update: data,
    });

    const url = `${this.config.get('FRONTEND_DOMAIN', { infer: true })}/reset-password?token=${token}`;
    await this.mail.send({
      to: username,
      subject: 'Reset Your Password',
      html: `Here is link to reset your profile password, open link to setup new password. the link is only valid till next 20 minutes, don't share this link with anyone.<br/><br/>${url}`,
    });
  }

  async resetPassword(token: string, password: string) {
    const resetToken = await this.prisma.reset_password_tokens.findFirst({
      where: {
        reset_token: sha256(token),
        expires_at: { gt: nowAsDbDateTime() },
      },
      select: { username: true },
    });
    if (!resetToken) return false;

    const user = await this.prisma.users.findUnique({
      where: { username: resetToken.username },
      select: { username: true, tenant_id: true },
    });
    const hash = await bcrypt.hash(password, this.salt);

    await this.prisma.$transaction([
      this.prisma.refresh_tokens.deleteMany({
        where: { username: resetToken.username, tenant_id: user?.tenant_id },
      }),
      this.prisma.users.updateMany({
        where: { username: resetToken.username, tenant_id: user?.tenant_id },
        data: { password: hash },
      }),
      // O legado apagava pelo hash da senha (bug) e o token continuava válido
      this.prisma.reset_password_tokens.delete({
        where: { username: resetToken.username },
      }),
    ]);
    return true;
  }

  async signInOrSignUpWithGoogle(
    email: string,
    name: string | null,
    photo: string | null,
  ) {
    const existing = await this.prisma.users.findUnique({
      where: { username: email },
      select: { username: true },
    });

    if (existing) {
      await this.prisma.users.update({
        where: { username: email },
        data: { photo },
      });
    } else {
      await this.createTenantWithAdmin(name, {
        username: email,
        password: '',
        name,
        photo,
      });
    }
    return (await this.findUser(email))!;
  }
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
