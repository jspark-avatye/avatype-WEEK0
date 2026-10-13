import { Module } from '@nestjs/common';
import { PrismaClient, PrismaPg } from '@root/database';
import { AUTH_REPOSITORY, AUTH_USE_CASE, PASSWORD_HASHER } from './application/auth.ports';
import { AuthApplicationService } from './application/auth.service';
import { AuthController } from './auth.controller';
import { AccessTokenService } from './infrastructure/access-token.service';
import { AuthConfig } from './infrastructure/auth-config';
import { PRISMA_CLIENT, PrismaAuthRepository } from './infrastructure/prisma-auth.repository';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher';

@Module({
  providers: [
    AuthController,
    AuthConfig,
    AccessTokenService,
    PrismaAuthRepository,
    ScryptPasswordHasher,
    {
      provide: PRISMA_CLIENT,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error('DATABASE_URL is required');
        return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
      },
    },
    { provide: AUTH_REPOSITORY, useExisting: PrismaAuthRepository },
    { provide: PASSWORD_HASHER, useExisting: ScryptPasswordHasher },
    {
      provide: AUTH_USE_CASE,
      useFactory: (repository: PrismaAuthRepository, passwordHasher: ScryptPasswordHasher) =>
        new AuthApplicationService(repository, passwordHasher),
      inject: [AUTH_REPOSITORY, PASSWORD_HASHER],
    },
  ],
  exports: [AuthController, AuthConfig],
})
export class AuthModule {}
