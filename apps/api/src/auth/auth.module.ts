import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionGuard } from './permission.guard';
import { PasswordService } from './password.service';
import { NativeRefreshRateLimiter } from './native-refresh-rate-limiter.service';
import { DistributedAuthRateLimiter } from './distributed-auth-rate-limiter.service';
import { BrowserSessionService } from './browser-session.service';
import { BrowserCsrfGuard } from './browser-csrf.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    PasswordService,
    NativeRefreshRateLimiter,
    DistributedAuthRateLimiter,
    BrowserSessionService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BrowserCsrfGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
  exports: [
    AuthService,
    AuthTokenService,
    DistributedAuthRateLimiter,
    PasswordService,
  ],
})
export class AuthModule {}
