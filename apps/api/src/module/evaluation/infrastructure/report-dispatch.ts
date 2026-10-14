import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ReportDispatch } from '../application/evaluation.ports';
import { REPORT_USE_CASE, type ReportUseCase } from '../../report/application/report.ports';
@Injectable()
export class ReportDispatchAdapter implements ReportDispatch {
  private readonly logger = new Logger(ReportDispatchAdapter.name);
  constructor(@Inject(REPORT_USE_CASE) private readonly report: Pick<ReportUseCase, 'ensureScheduled'>) {}
  async ensureScheduled(evaluationId: string) {
    try { await this.report.ensureScheduled(evaluationId); }
    catch { this.logger.warn('Report scheduling unavailable; analysis remains pending'); }
  }
}
