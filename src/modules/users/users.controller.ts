import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody } from '../../common/decorators/zod.decorator.js';
import { ApiImageUpload } from '../../common/decorators/api-image-upload.decorator.js';
import { Scope } from '../../common/enums/scope.enum.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import {
  FREE_MAX_USERS,
  hasProAccess,
  ProRequiredException,
} from '../../common/utils/plan.js';
import { StorageService } from '../../integrations/storage/storage.service.js';
import { UsersService } from './users.service.js';
import {
  createUserSchema,
  updatePasswordSchema,
  updateUserSchema,
  type CreateUserDto,
  type UpdatePasswordDto,
  type UpdateUserDto,
} from './dto/user.schema.js';

// Rotas de backend-legado/src/routes/user.routes.js.
// No legado qualquer usuário logado podia criar/editar/remover usuários;
// aqui a gestão de usuários exige admin (@Scopes() vazio).
@ApiTags('users')
@ApiCookieAuth('accessToken')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Scopes()
  async findAll(@CurrentUser() user: JwtPayload) {
    const users = await this.users.findAll(user.tenant_id);
    if (!users.length) throw new NotFoundException('No users found!');
    return users;
  }

  @Get('scopes')
  getScopes() {
    return Object.values(Scope);
  }

  @Post('add')
  @HttpCode(200)
  @Scopes()
  @ZodBody(createUserSchema)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    if (
      !hasProAccess(user) &&
      (await this.users.count(user.tenant_id)) >= FREE_MAX_USERS
    ) {
      throw new ProRequiredException(
        `O plano grátis permite até ${FREE_MAX_USERS} usuários. Equipe maior faz parte do plano Pro.`,
      );
    }
    await this.users.create(user.tenant_id, dto);
    return { success: true, message: 'User Added Successfully.' };
  }

  @Delete('delete/:id')
  @Scopes()
  async remove(@CurrentUser() user: JwtPayload, @Param('id') username: string) {
    assertNotSelf(user, username);
    await this.users.remove(user.tenant_id, username);
    return { success: true, message: 'User Deleted Successfully.' };
  }

  @Post('update/:id')
  @HttpCode(200)
  @Scopes()
  @ZodBody(updateUserSchema)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') username: string,
    @Body() dto: UpdateUserDto,
  ) {
    assertNotSelf(user, username);
    await this.users.update(user.tenant_id, username, dto);
    return { success: true, message: 'User Details Updated.' };
  }

  @Post('update-password/:id')
  @HttpCode(200)
  @Scopes()
  @ZodBody(updatePasswordSchema)
  async updatePassword(
    @CurrentUser() user: JwtPayload,
    @Param('id') username: string,
    @Body() dto: UpdatePasswordDto,
  ) {
    assertNotSelf(user, username);
    await this.users.updatePassword(user.tenant_id, username, dto.password);
    return { success: true, message: 'User Password Updated.' };
  }

  @Post('profile/photo')
  @HttpCode(200)
  @ApiImageUpload()
  async uploadPhoto(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Nenhuma imagem enviada!');
    const fileName = `avatar-${user.username.replace(/[^a-z0-9]/gi, '_')}.webp`;
    const photoUrl = await this.storage.saveImage(
      file.buffer,
      `${user.tenant_id}/${fileName}`,
      {
        width: 400,
        height: 400,
        fit: 'cover',
        quality: 85,
      },
    );
    await this.users.updatePhoto(user.tenant_id, user.username, photoUrl);
    return { success: true, message: 'Foto atualizada!', photoUrl };
  }
}

function assertNotSelf(user: JwtPayload, username: string) {
  if (user.username == username) {
    throw new BadRequestException('Operation not allowed!');
  }
}
