import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Scopes } from '../../common/decorators/scopes.decorator.js';
import { ZodBody } from '../../common/decorators/zod.decorator.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { AuthCookiesService } from '../auth/auth-cookies.service.js';
import { AccountService } from './account.service.js';

export const DELETE_CONFIRMATION = 'EXCLUIR';

const deleteAccountSchema = z.object({
  confirm: z.literal(DELETE_CONFIRMATION, {
    error: `Digite ${DELETE_CONFIRMATION} para confirmar.`,
  }),
  // Obrigatória para conta com senha; conta do Google não tem
  password: z.string().optional(),
});
type DeleteAccountDto = z.infer<typeof deleteAccountSchema>;

@ApiTags('account')
@ApiCookieAuth('accessToken')
@Controller('account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly cookies: AuthCookiesService,
  ) {}

  @Post('delete')
  @HttpCode(200)
  @Scopes()
  @ApiOperation({
    summary:
      'Exclui a loja inteira: usuários, cardápio, pedidos e fotos (somente admin)',
  })
  @ZodBody(deleteAccountSchema)
  async delete(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.account.deleteTenant(
      user.tenant_id,
      user.username,
      dto.password,
    );
    this.cookies.clearAll(res);
    return { success: true, message: 'Sua conta foi excluída.' };
  }
}
