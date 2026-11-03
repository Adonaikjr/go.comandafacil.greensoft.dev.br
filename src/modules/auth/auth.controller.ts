import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodBody, ZodResponse } from '../../common/decorators/zod.decorator.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';
import { deviceFromRequest } from '../../common/utils/device.js';
import { AuthService } from './auth.service.js';
import { AuthCookiesService } from './auth-cookies.service.js';
import { TokenService } from './token.service.js';
import {
  GoogleOAuthService,
  type GoogleAppState,
} from './google-oauth.service.js';
import {
  forgotPasswordSchema,
  googleExchangeSchema,
  messageSchema,
  removeDeviceSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type ForgotPasswordDto,
  type GoogleExchangeDto,
  type RemoveDeviceDto,
  type ResetPasswordDto,
  type SignInDto,
  type SignUpDto,
} from './dto/auth.schema.js';

// Rotas de backend-legado/src/routes/auth.routes.js (exceto Stripe → BillingController)
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookiesService,
    private readonly tokens: TokenService,
    private readonly google: GoogleOAuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('signin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login com e-mail e senha' })
  @ZodBody(signInSchema)
  async signIn(
    @Body() dto: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.validateCredentials(
      dto.username,
      dto.password,
    );
    if (!user) throw new UnauthorizedException('E-mail ou senha inválidos!');

    const accessToken = await this.issueLoginTokens(user, req, res);
    return {
      success: true,
      message: 'Login realizado com sucesso.',
      accessToken,
      user,
    };
  }

  @Public()
  @Post('signup')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cria um restaurante (tenant) com o usuário admin' })
  @ZodBody(signUpSchema)
  @ZodResponse(messageSchema)
  async signUp(@Body() dto: SignUpDto) {
    await this.auth.signUp(dto.biz_name, dto.username, dto.password);
    return {
      success: true,
      message: 'Conta criada com sucesso, você já pode fazer login!',
    };
  }

  @Post('signout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout do dispositivo atual' })
  @ZodResponse(messageSchema)
  async signOut(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.cookies.clearAll(res);
    await this.auth.removeRefreshToken(
      user.username,
      req.cookies?.refreshToken,
    );
    return { success: true, message: 'Logout realizado com sucesso.' };
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Gera um novo access token a partir do cookie refreshToken',
  })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Login again to access this area!');
    }

    let tokenUser: JwtPayload;
    try {
      tokenUser = this.tokens.verify(refreshToken);
    } catch {
      this.cookies.clearAll(res);
      res.clearCookie('restro__authenticated', {
        domain: this.config.get('FRONTEND_DOMAIN_COOKIE', { infer: true }),
        path: '/',
      });
      throw new UnauthorizedException('Unauthorized access!');
    }

    const user = (await this.auth.refreshTokenExists(refreshToken))
      ? await this.auth.findUser(tokenUser.username, tokenUser.tenant_id)
      : null;

    if (!user) {
      this.cookies.clearAll(res);
      res.status(401);
      return {
        success: false,
        loginNeeded: true,
        message: 'Faça login novamente para acessar esta página.',
      };
    }

    const accessToken = this.tokens.signAccess(this.auth.toPayload(user));
    this.cookies.setAccessCookie(res, accessToken);
    return {
      success: true,
      message: 'Novo token criado com sucesso.',
      accessToken,
    };
  }

  @Post('remove-device')
  @HttpCode(200)
  @ApiOperation({ summary: 'Desconecta outro dispositivo' })
  @ZodBody(removeDeviceSchema)
  @ZodResponse(messageSchema)
  async removeDevice(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RemoveDeviceDto,
    @Req() req: Request,
  ) {
    if (req.cookies?.refreshToken == dto.device_id) {
      throw new BadRequestException('Operação não permitida!');
    }
    await this.auth.removeDevice(user.username, Number(dto.device_id));
    return { success: true, message: 'Dispositivo removido com sucesso.' };
  }

  @Get('devices')
  @ApiOperation({ summary: 'Lista os dispositivos conectados' })
  devices(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    // O web manda o refresh token no cookie; o app nativo nao usa cookie e
    // manda no header, so para a API marcar qual aparelho e o dele.
    const header = req.headers['x-refresh-token'];
    const current =
      req.cookies?.refreshToken ??
      (typeof header === 'string' ? header : undefined);
    return this.auth.getDevices(user.username, current);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envia o e-mail de redefinição de senha' })
  @ZodBody(forgotPasswordSchema)
  @ZodResponse(messageSchema)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.username);
    return {
      success: true,
      message:
        'Você receberá um e-mail com instruções para redefinir a senha. Verifique o spam se o e-mail não chegar na sua caixa de entrada.',
    };
  }

  @Public()
  @Post('reset-password/:token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Redefine a senha com o token recebido por e-mail' })
  @ZodBody(resetPasswordSchema)
  @ZodResponse(messageSchema)
  async resetPassword(
    @Param('token') token: string,
    @Body() dto: ResetPasswordDto,
  ) {
    const changed = await this.auth.resetPassword(token, dto.password);
    if (!changed) {
      throw new BadRequestException('Solicitação inválida ou link expirado!');
    }
    return { success: true, message: 'Senha alterada com sucesso!' };
  }

  @Public()
  @Get('google')
  @ApiOperation({
    summary: 'Redireciona para o login do Google',
    description:
      'Sem parâmetros: fluxo do PDV web (cookies + redirect ao frontend). ' +
      'Com redirect_uri e code_challenge (PKCE S256): fluxo do app nativo, ' +
      'que volta ao app com um código para POST /auth/google/exchange.',
  })
  googleAuth(
    @Query('redirect_uri') redirectUri: string | undefined,
    @Query('code_challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    if (redirectUri === undefined && challenge === undefined) {
      return res.redirect(this.google.getAuthUrl());
    }
    if (
      !redirectUri ||
      !this.google.isAppRedirect(redirectUri) ||
      !challenge ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge)
    ) {
      throw new BadRequestException('Parâmetros de login inválidos.');
    }
    const state = this.google.signAppState(redirectUri, challenge);
    return res.redirect(this.google.getAuthUrl(state));
  }

  @Public()
  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const appState = state ? this.google.verifyAppState(state) : null;
    if (appState) return this.googleAppCallback(code, appState, res);

    const frontend = this.config.get('FRONTEND_DOMAIN', { infer: true });
    if (!code)
      return res.redirect(`${frontend}/login?error=google_auth_failed`);

    try {
      const user = await this.googleSignIn(code);
      if (!user) {
        return res.redirect(`${frontend}/login?error=google_no_email`);
      }
      await this.issueLoginTokens(user, req, res);

      const data = Buffer.from(JSON.stringify(user)).toString('base64');
      return res.redirect(`${frontend}/auth/google/success?data=${data}`);
    } catch (error) {
      this.logger.error(error, 'Google OAuth error');
      return res.redirect(`${frontend}/login?error=google_auth_failed`);
    }
  }

  @Public()
  @Post('google/exchange')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Troca o código do login Google do app nativo pelos tokens',
  })
  @ZodBody(googleExchangeSchema)
  async googleExchange(
    @Body() dto: GoogleExchangeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const grant = this.google.verifyAppCode(dto.code, dto.code_verifier);
    const user = grant
      ? await this.auth.findUser(grant.username, grant.tenantId)
      : null;
    if (!user) {
      throw new UnauthorizedException(
        'Não foi possível entrar com o Google. Tente de novo.',
      );
    }

    const accessToken = await this.issueLoginTokens(user, req, res);
    return {
      success: true,
      message: 'Login realizado com sucesso.',
      accessToken,
      user,
    };
  }

  private async googleAppCallback(
    code: string | undefined,
    appState: GoogleAppState,
    res: Response,
  ) {
    const back = (params: Record<string, string>) =>
      res.redirect(this.google.appRedirect(appState.redirectUri, params));

    if (!code) return back({ error: 'google_auth_failed' });

    try {
      const user = await this.googleSignIn(code);
      if (!user) return back({ error: 'google_no_email' });

      return back({
        code: this.google.signAppCode(
          user.username,
          user.tenant_id!,
          appState.challenge,
        ),
      });
    } catch (error) {
      this.logger.error(error, 'Google OAuth error (app)');
      return back({ error: 'google_auth_failed' });
    }
  }

  // null quando o Google não devolve e-mail
  private async googleSignIn(code: string) {
    const googleUser = await this.google.getUser(code);
    if (!googleUser.email) return null;

    return this.auth.signInOrSignUpWithGoogle(
      googleUser.email,
      googleUser.name ?? null,
      googleUser.picture ?? null,
    );
  }

  private async issueLoginTokens(
    user: NonNullable<Awaited<ReturnType<AuthService['findUser']>>>,
    req: Request,
    res: Response,
  ) {
    const payload = this.auth.toPayload(user);
    const accessToken = this.tokens.signAccess(payload);
    const refreshToken = this.tokens.signRefresh(payload);
    const refreshExpiry = this.cookies.refreshExpiry();

    this.cookies.setLoginCookies(res, accessToken, refreshToken, refreshExpiry);
    await this.auth.saveRefreshToken(
      user,
      refreshToken,
      refreshExpiry,
      deviceFromRequest(req),
    );
    return accessToken;
  }
}
