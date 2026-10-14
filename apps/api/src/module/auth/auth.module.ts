import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AUTH_REPOSITORY, AUTH_USE_CASE, PASSWORD_HASHER } from './application/auth.ports';
import { AuthApplicationService } from './application/auth.service';
import { AuthController } from './auth.controller';
import { AccessTokenService } from './infrastructure/access-token.service';
import { AuthConfig } from './infrastructure/auth-config';
import { PrismaAuthRepository } from './infrastructure/prisma-auth.repository';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher';

@Module({
  imports: [DatabaseModule],
  providers: [
    AuthController,
    AuthConfig,
    AccessTokenService,
    PrismaAuthRepository,
    ScryptPasswordHasher,
    { provide: AUTH_REPOSITORY, useExisting: PrismaAuthRepository },
    { provide: PASSWORD_HASHER, useExisting: ScryptPasswordHasher },
    {
      provide: AUTH_USE_CASE,
      useFactory: (repository: PrismaAuthRepository, passwordHasher: ScryptPasswordHasher) =>
        new AuthApplicationService(repository, passwordHasher),
      inject: [AUTH_REPOSITORY, PASSWORD_HASHER],
    },
  ],
  exports: [AuthController, AuthConfig, AUTH_USE_CASE],
})
export class AuthModule {}
