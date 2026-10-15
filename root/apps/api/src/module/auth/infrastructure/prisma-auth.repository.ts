import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@root/database';
import { AuthError } from '../domain/auth-error';
import type { Account } from '../domain/account';
import type { AuthRepository, RefreshCredential } from '../application/auth.ports';
import { PRISMA_CLIENT } from '../../../database/database.module';

function toAccount(row: {
  userId: string;
  loginId: string;
  passwordHash: string;
  accountStatus: 'ACTIVE' | 'DISABLED';
}, currentLevelCode: string | null = null): Account {
  return {
    userId: row.userId,
    loginId: row.loginId,
    passwordHash: row.passwordHash,
    accountStatus: row.accountStatus,
    currentLevelCode,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  private async latestLevel(userId: string): Promise<string | null> {
    const report = await this.prisma.evaluationReport.findFirst({ where: { verdict: 'CONFIRMED', evaluation: { userId } },
      orderBy: [{ evaluation: { startedAt: 'desc' } }, { createdAt: 'desc' }, { reportId: 'desc' }], select: { finalLevelCode: true },
    });
    return report?.finalLevelCode ?? null;
  }

  async findByLoginId(loginId: string): Promise<Account | null> {
    const row = await this.prisma.userAccount.findUnique({ where: { loginId } });
    return row ? toAccount(row, await this.latestLevel(row.userId)) : null;
  }

  async findByUserId(userId: string): Promise<Account | null> {
    const row = await this.prisma.userAccount.findUnique({ where: { userId } });
    return row ? toAccount(row, await this.latestLevel(row.userId)) : null;
  }

  async createAccountWithRefresh(input: {
    loginId: string;
    passwordHash: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<Account> {
    try {
      const row = await this.prisma.userAccount.create({
        data: {
          loginId: input.loginId,
          passwordHash: input.passwordHash,
          accountStatus: 'ACTIVE',
          refreshTokens: { create: { tokenHash: input.tokenHash, expiresAt: input.expiresAt } },
        },
      });
      return toAccount(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new AuthError('CONFLICT', '이미 사용 중인 ID입니다.');
      throw error;
    }
  }

  async createRefresh(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.prisma.refreshToken.create({ data: input });
  }

  async findRefreshByHash(tokenHash: string): Promise<RefreshCredential | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    return row
      ? {
          tokenId: row.tokenId,
          tokenHash: row.tokenHash,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          account: toAccount(row.user, await this.latestLevel(row.userId)),
        }
      : null;
  }

  async rotateRefresh(input: {
    tokenId: string;
    oldHash: string;
    newHash: string;
    now: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.refreshToken.findUnique({
        where: { tokenId: input.tokenId },
        include: { user: true },
      });
      if (!row || row.user.accountStatus !== 'ACTIVE') return false;
      const result = await transaction.refreshToken.updateMany({
        where: {
          tokenId: input.tokenId,
          tokenHash: input.oldHash,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
        data: { tokenHash: input.newHash },
      });
      return result.count === 1;
    });
  }

  async revokeRefresh(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
  }
}
