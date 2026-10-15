import { Controller, Inject } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import type { HistoryInput, ReportRpcController } from '@root/trpc-contract';
import { REPORT_USE_CASE, ReportError, ProcessingError, type ReportUseCase } from './application/report.ports';
@Controller()
export class ReportController implements ReportRpcController {
  constructor(@Inject(REPORT_USE_CASE) private readonly useCase: ReportUseCase) {}
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof ReportError) throw new TRPCError({ code: error.code, message: error.message });
      if (error instanceof ProcessingError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '보고서 정보를 처리하지 못했습니다. 잠시 후 다시 확인해 주세요.' });
      throw error;
    }
  }
  analyze(userId: string, evaluationId: string) { return this.run(() => this.useCase.analyze(userId, evaluationId)); }
  get(userId: string, evaluationId: string) { return this.run(() => this.useCase.get(userId, evaluationId)); }
  retry(userId: string, evaluationId: string) { return this.run(() => this.useCase.retry(userId, evaluationId)); }
  history(userId: string, input: HistoryInput) { return this.run(() => this.useCase.history(userId, input)); }
  answerAudio(userId: string, evaluationId: string, answerId: string) { return this.run(async () => {
    const audio = await this.useCase.answerAudio(userId, evaluationId, answerId);
    return { mimeType: audio.mimeType, audioBase64: Buffer.from(audio.bytes).toString('base64') };
  }); }
}
