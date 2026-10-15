import { Inject, Injectable } from '@nestjs/common';
import { AUTH_USE_CASE, type AuthUseCase } from '../../auth/application/auth.ports';
import type { ActiveAccounts } from '../application/evaluation.ports';
import { EvaluationError } from '../domain/evaluation-error';

@Injectable()
export class AuthActiveAccounts implements ActiveAccounts {
  constructor(@Inject(AUTH_USE_CASE) private readonly auth: Pick<AuthUseCase, 'checkActive'>) {}
  async checkActive(userId: string) {
    try { await this.auth.checkActive(userId); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'UNAUTHORIZED') {
        throw new EvaluationError('UNAUTHORIZED', '인증에 실패했습니다.');
      }
      throw error;
    }
  }
}
