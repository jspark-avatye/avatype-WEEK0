import type { AuthRepository, AuthUseCase, PasswordHasher } from './auth.ports';
import { AuthError } from '../domain/auth-error';
import { normalizeLoginId, requireActive, validateSignup, type Account } from '../domain/account';

export class AuthApplicationService implements AuthUseCase {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async checkActive(userId: string): Promise<void> {
    requireActive(await this.repository.findByUserId(userId));
  }

  async signup(input: {
    loginId: string;
    password: string;
    passwordConfirm: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<Account> {
    const loginId = normalizeLoginId(input.loginId);
    validateSignup(loginId, input.password, input.passwordConfirm);
    if (await this.repository.findByLoginId(loginId)) {
      throw new AuthError('CONFLICT', '이미 사용 중인 ID입니다.');
    }
    const passwordHash = await this.passwordHasher.hash(input.password);
    return this.repository.createAccountWithRefresh({
      loginId,
      passwordHash,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
  }

  async login(input: {
    loginId: string;
    password: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<Account> {
    const account = await this.repository.findByLoginId(normalizeLoginId(input.loginId));
    const validPassword = account
      ? await this.passwordHasher.verify(input.password, account.passwordHash)
      : false;
    if (!account || !validPassword) throw new AuthError('UNAUTHORIZED', '인증에 실패했습니다.');
    requireActive(account);
    await this.repository.createRefresh({
      userId: account.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
    return account;
  }

  async me(userId: string): Promise<Account> {
    return requireActive(await this.repository.findByUserId(userId));
  }

  async refresh(oldHash: string, newHash: string): Promise<{ account: Account; expiresAt: Date }> {
    const credential = await this.repository.findRefreshByHash(oldHash);
    const now = new Date();
    if (!credential || credential.revokedAt || credential.expiresAt <= now) {
      throw new AuthError('UNAUTHORIZED', '인증에 실패했습니다.');
    }
    const account = requireActive(credential.account);
    const rotated = await this.repository.rotateRefresh({
      tokenId: credential.tokenId,
      oldHash,
      newHash,
      now,
    });
    if (!rotated) throw new AuthError('UNAUTHORIZED', '인증에 실패했습니다.');
    return { account, expiresAt: credential.expiresAt };
  }

  async logout(tokenHash: string | null): Promise<void> {
    if (tokenHash) await this.repository.revokeRefresh(tokenHash, new Date());
  }
}
