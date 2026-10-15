import { Inject, Injectable } from '@nestjs/common';
import { AUTH_USE_CASE, type AuthUseCase } from '../../auth/application/auth.ports';
import type { ReportAccounts } from '../application/report.ports';
import { ReportError } from '../domain/report-error';
@Injectable()
export class AuthReportAccounts implements ReportAccounts {
  constructor(@Inject(AUTH_USE_CASE) private readonly auth: Pick<AuthUseCase, 'checkActive'>) {}
  async checkActive(userId: string) {
    try { await this.auth.checkActive(userId); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'UNAUTHORIZED') throw new ReportError('UNAUTHORIZED', '인증에 실패했습니다.');
      throw error;
    }
  }
}
