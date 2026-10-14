import { Controller, Inject } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import type { CreateEvaluationInput, EvaluationRpcController } from '@root/trpc-contract';
import { EVALUATION_USE_CASE, EvaluationError, ProcessingError, type EvaluationUseCase } from './application/evaluation.ports';

@Controller()
export class EvaluationController implements EvaluationRpcController {
  constructor(@Inject(EVALUATION_USE_CASE) private readonly useCase: EvaluationUseCase) {}
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof EvaluationError) throw new TRPCError({ code: error.code, message: error.message });
      if (error instanceof ProcessingError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.publicCode === 'AUDIO_CONFIGURATION' ? '서버 음성 검사 설정을 확인해 주세요.' : '음성을 저장하거나 가져오지 못했습니다. 다시 시도해 주세요.' });
      throw error;
    }
  }
  options(userId: string) { return this.run(() => this.useCase.options(userId)); }
  create(userId: string, input: CreateEvaluationInput) { return this.run(() => this.useCase.create(userId, input)); }
  start(userId: string, evaluationId: string) { return this.run(() => this.useCase.start(userId, evaluationId)); }
  get(userId: string, evaluationId: string) { return this.run(() => this.useCase.get(userId, evaluationId)); }
  retry(userId: string, evaluationId: string) { return this.run(() => this.useCase.retry(userId, evaluationId)); }
  pause(userId: string, evaluationId: string) { return this.run(() => this.useCase.pause(userId, evaluationId)); }
  resume(userId: string, evaluationId: string) { return this.run(() => this.useCase.resume(userId, evaluationId)); }
  end(userId: string, evaluationId: string) { return this.run(() => this.useCase.end(userId, evaluationId)); }
  resumable(userId: string) { return this.run(() => this.useCase.resumable(userId)); }
  submitAnswer(userId: string, input: FormData) {
    return this.run(async () => {
      const file = input.get('audio');
      const evaluationId = input.get('evaluationId'); const questionId = input.get('questionId');
      if (!(file instanceof Blob) || typeof evaluationId !== 'string' || typeof questionId !== 'string') throw new EvaluationError('BAD_REQUEST', '음성 파일과 질문을 확인해 주세요.');
      return this.useCase.submitAnswer(userId, { evaluationId, questionId, bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type });
    });
  }
  audio(userId: string, audioId: string) {
    return this.run(async () => {
      const audio = await this.useCase.audio(userId, audioId);
      return { mimeType: audio.mimeType, audioBase64: Buffer.from(audio.bytes).toString('base64') };
    });
  }
}
