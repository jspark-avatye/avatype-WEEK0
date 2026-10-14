import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { REPORT_ANALYSIS_USE_CASE, type ReportAnalysisUseCase } from '../application/report.ports';
import { BullMQReportQueue } from './bullmq-report.queue';
@Injectable()
export class ReportProcessor implements OnModuleInit {
  constructor(@Inject(REPORT_ANALYSIS_USE_CASE) private readonly useCase: ReportAnalysisUseCase, private readonly jobs: BullMQReportQueue) {}
  onModuleInit() { this.jobs.startWorker((evaluationId, progress) => this.useCase.process(evaluationId, progress)); }
}
