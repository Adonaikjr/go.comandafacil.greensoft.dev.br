import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodBody } from '../../common/decorators/zod.decorator.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { PushService } from './push.service.js';

// Token do Expo: "ExponentPushToken[...]" (ou "ExpoPushToken[...]").
const tokenSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^Expo(nent)?PushToken\[.+\]$/, 'Token de push inválido.')
    .max(255),
  platform: z.enum(['ios', 'android']).nullish(),
});
type TokenDto = z.infer<typeof tokenSchema>;

@ApiTags('push')
@ApiCookieAuth('accessToken')
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post('register')
  @HttpCode(200)
  @ApiOperation({ summary: 'Registra o aparelho para receber push do app' })
  @ZodBody(tokenSchema)
  async register(@CurrentUser() user: JwtPayload, @Body() dto: TokenDto) {
    await this.push.register(
      user.tenant_id,
      user.username,
      dto.token,
      dto.platform,
    );
    return { success: true };
  }

  @Post('unregister')
  @HttpCode(200)
  @ApiOperation({ summary: 'Para de mandar push para este aparelho' })
  @ZodBody(tokenSchema)
  async unregister(@CurrentUser() user: JwtPayload, @Body() dto: TokenDto) {
    await this.push.unregister(user.username, dto.token);
    return { success: true };
  }
}
