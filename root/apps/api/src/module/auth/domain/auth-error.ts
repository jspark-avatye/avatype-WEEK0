export type AuthErrorCode = 'BAD_REQUEST' | 'CONFLICT' | 'UNAUTHORIZED';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string) {
    super(message);
  }
}
