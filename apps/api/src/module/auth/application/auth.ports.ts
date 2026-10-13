import type { Account } from '../domain/account';

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const AUTH_USE_CASE = Symbol('AUTH_USE_CASE');

export type RefreshCredential = {
  tokenId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  account: Account;
};

export interface AuthRepository {
  findByLoginId(loginId: string): Promise<Account | null>;
  findByUserId(userId: string): Promise<Account | null>;
  createAccountWithRefresh(input: {
    loginId: string;
    passwordHash: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<Account>;
  createRefresh(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findRefreshByHash(tokenHash: string): Promise<RefreshCredential | null>;
  rotateRefresh(input: {
    tokenId: string;
    oldHash: string;
    newHash: string;
    now: Date;
  }): Promise<boolean>;
  revokeRefresh(tokenHash: string, now: Date): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
}

export interface AuthUseCase {
  signup(input: {
    loginId: string;
    password: string;
    passwordConfirm: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<Account>;
  login(input: {
    loginId: string;
    password: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<Account>;
  me(userId: string): Promise<Account>;
  refresh(oldHash: string, newHash: string): Promise<{ account: Account; expiresAt: Date }>;
  logout(tokenHash: string | null): Promise<void>;
}
