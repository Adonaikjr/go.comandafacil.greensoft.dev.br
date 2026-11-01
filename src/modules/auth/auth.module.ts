import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthCookiesService } from './auth-cookies.service.js';
import { TokenService } from './token.service.js';
import { GoogleOAuthService } from './google-oauth.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookiesService,
    TokenService,
    GoogleOAuthService,
  ],
  exports: [AuthService, AuthCookiesService, TokenService],
})
export class AuthModule {}
