import { Controller, Inject } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthRpcController, LoginInput, SignupInput } from '@root/trpc-contract';
import { AUTH_USE_CASE, type AuthUseCase } from './application/auth.ports';
import { toPublicAccount } from './domain/account';
import { AuthError } from './domain/auth-error';
import { AccessTokenService } from './infrastructure/access-token.service';
import { AuthConfig } from './infrastructure/auth-config';

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function candidate(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: tokenHash(token) };
}

function validRefresh(token: string | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

@Controller()
export class AuthController implements AuthRpcController {
  constructor(
    @Inject(AUTH_USE_CASE) private readonly useCase: AuthUseCase,
    private readonly accessTokens: AccessTokenService,
    private readonly config: AuthConfig,
  ) {}

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AuthError) throw new TRPCError({ code: error.code, message: error.message });
      throw error;
    }
  }

  signup(input: SignupInput) {
    return this.run(async () => {
      const refresh = candidate();
      const refreshExpiresAt = this.config.refreshExpiry();
      const account = await this.useCase.signup({
        ...input,
        tokenHash: refresh.hash,
        expiresAt: refreshExpiresAt,
      });
      return {
        user: toPublicAccount(account),
        accessToken: await this.accessTokens.sign(account.userId),
        refreshToken: refresh.token,
        refreshExpiresAt,
      };
    });
  }

  login(input: LoginInput) {
    return this.run(async () => {
      const refresh = candidate();
      const refreshExpiresAt = this.config.refreshExpiry();
      const account = await this.useCase.login({
        ...input,
        tokenHash: refresh.hash,
        expiresAt: refreshExpiresAt,
      });
      return {
        user: toPublicAccount(account),
        accessToken: await this.accessTokens.sign(account.userId),
        refreshToken: refresh.token,
        refreshExpiresAt,
      };
    });
  }

  me(userId: string) {
    return this.run(async () => toPublicAccount(await this.useCase.me(userId)));
  }

  checkActive(userId: string) {
    return this.run(() => this.useCase.checkActive(userId));
  }

  refresh(refreshToken: string | undefined) {
    return this.run(async () => {
      if (!validRefresh(refreshToken)) throw new AuthError('UNAUTHORIZED', '인증에 실패했습니다.');
      const replacement = candidate();
      const result = await this.useCase.refresh(tokenHash(refreshToken), replacement.hash);
      return {
        accessToken: await this.accessTokens.sign(result.account.userId),
        refreshToken: replacement.token,
        refreshExpiresAt: result.expiresAt,
      };
    });
  }

  logout(refreshToken: string | undefined) {
    return this.run(() => this.useCase.logout(validRefresh(refreshToken) ? tokenHash(refreshToken) : null));
  }

  verifyAccess(authorization: string | undefined) {
    return this.accessTokens.verifyAuthorization(authorization);
  }
}
