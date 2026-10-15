import { AuthError } from './auth-error';

export type Account = {
  userId: string;
  loginId: string;
  passwordHash: string;
  accountStatus: 'ACTIVE' | 'DISABLED';
  currentLevelCode: string | null;
};

export type PublicAccount = Omit<Account, 'passwordHash' | 'accountStatus'>;

export function normalizeLoginId(value: string): string {
  return value.trim().toLowerCase();
}

export function validateSignup(loginId: string, password: string, confirmation: string): void {
  if (!/^[a-z0-9._-]{4,32}$/.test(loginId)) {
    throw new AuthError('BAD_REQUEST', 'ID는 영문 소문자, 숫자, ., _, -를 사용해 4~32자로 입력해 주세요.');
  }
  if (password.length < 8 || password.length > 128) {
    throw new AuthError('BAD_REQUEST', '비밀번호는 8~128자로 입력해 주세요.');
  }
  if (password !== confirmation) {
    throw new AuthError('BAD_REQUEST', '비밀번호 확인이 일치하지 않습니다.');
  }
}

export function requireActive(account: Account | null): Account {
  if (!account || account.accountStatus !== 'ACTIVE') {
    throw new AuthError('UNAUTHORIZED', '인증에 실패했습니다.');
  }
  return account;
}

export function toPublicAccount(account: Account): PublicAccount {
  return {
    userId: account.userId,
    loginId: account.loginId,
    currentLevelCode: account.currentLevelCode,
  };
}
