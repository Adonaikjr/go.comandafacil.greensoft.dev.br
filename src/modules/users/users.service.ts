import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { CreateUserDto, UpdateUserDto } from './dto/user.schema.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private hash(password: string) {
    return bcrypt.hash(
      password,
      this.config.get('PASSWORD_SALT', { infer: true }),
    );
  }

  findAll(tenantId: number) {
    return this.prisma.users.findMany({
      where: { tenant_id: tenantId },
      select: {
        username: true,
        name: true,
        role: true,
        photo: true,
        designation: true,
        phone: true,
        email: true,
        scope: true,
      },
    });
  }

  async create(tenantId: number, dto: CreateUserDto) {
    const exists = await this.prisma.users.findUnique({
      where: { username: dto.username },
      select: { username: true },
    });
    if (exists) {
      throw new BadRequestException(
        'User already exist! Try Different username!',
      );
    }

    await this.prisma.users.create({
      data: {
        username: dto.username,
        password: await this.hash(dto.password),
        name: dto.name,
        role: Role.USER,
        designation: dto.designation,
        phone: dto.phone,
        email: dto.email,
        scope: dto.userScopes.join(','),
        tenant_id: tenantId,
      },
    });
  }

  async remove(tenantId: number, username: string) {
    await this.prisma.$transaction([
      this.prisma.refresh_tokens.deleteMany({
        where: { username, tenant_id: tenantId },
      }),
      this.prisma.users.deleteMany({
        where: { username, tenant_id: tenantId },
      }),
    ]);
  }

  // Derruba as sessões do usuário para que o novo escopo/senha valha já
  async update(tenantId: number, username: string, dto: UpdateUserDto) {
    await this.prisma.$transaction([
      this.prisma.refresh_tokens.deleteMany({
        where: { username, tenant_id: tenantId },
      }),
      this.prisma.users.updateMany({
        where: { username, tenant_id: tenantId },
        data: {
          name: dto.name,
          designation: dto.designation,
          phone: dto.phone,
          email: dto.email,
          scope: dto.userScopes.join(','),
        },
      }),
    ]);
  }

  async updatePassword(tenantId: number, username: string, password: string) {
    const hash = await this.hash(password);
    await this.prisma.$transaction([
      this.prisma.refresh_tokens.deleteMany({
        where: { username, tenant_id: tenantId },
      }),
      this.prisma.users.updateMany({
        where: { username, tenant_id: tenantId },
        data: { password: hash },
      }),
    ]);
  }

  async updatePhoto(tenantId: number, username: string, photo: string) {
    await this.prisma.users.updateMany({
      where: { username, tenant_id: tenantId },
      data: { photo },
    });
  }
}
