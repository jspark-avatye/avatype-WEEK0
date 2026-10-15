import type { CreateEvaluation, LevelCode, SessionSnapshot } from '../application/evaluation.contracts';
import { levelCodes } from '../application/evaluation.contracts';
import { EvaluationError, ProcessingError } from './evaluation-error';

const levels: Record<CreateEvaluation['startingBandCode'], LevelCode> = {
  BEGINNER: 'BEGINNER_MID', INTERMEDIATE: 'INTERMEDIATE_MID', ADVANCED: 'ADVANCED_MID',
};

export class EvaluationSession {
  private constructor(private readonly state: SessionSnapshot) {}

  static restore(state: SessionSnapshot): EvaluationSession {
    if ((state.status === 'IN_PROGRESS' || state.status === 'PAUSED') && !state.startedAt) {
      throw new EvaluationError('CONFLICT', '평가 진행 상태를 확인할 수 없습니다.');
    }
    return new EvaluationSession(structuredClone(state));
  }

  assertOwner(userId: string): void {
    if (this.state.userId !== userId) throw new EvaluationError('NOT_FOUND', '평가를 찾을 수 없습니다.');
  }

  assertFirstQuestionStage(): void {
    if (this.state.status !== 'READY' && this.state.status !== 'IN_PROGRESS') {
      throw new EvaluationError('CONFLICT', '첫 질문을 시작할 수 없는 평가입니다.');
    }
  }

  assertSameSettings(input: CreateEvaluation): void {
    if (input.topicCode !== this.state.topicCode || input.startingBandCode !== this.state.startingBandCode) {
      throw new EvaluationError('CONFLICT', '이미 다른 설정으로 생성한 평가입니다.');
    }
  }

  assertCanAcceptAnswer(userId: string, questionId: string, now: Date, maximumSeconds: number, resumeSeconds: number): void {
    this.assertOwner(userId);
    if (this.state.status !== 'IN_PROGRESS' || expiry(this.state, now, maximumSeconds, resumeSeconds)) throw new EvaluationError('CONFLICT', '답변 가능한 시간이 종료되었습니다.');
    if (!this.state.question?.audioId || this.state.question.questionId !== questionId) throw new EvaluationError('CONFLICT', '현재 질문에만 답변할 수 있습니다.');
  }

  assertCanPause(now: Date, maximumSeconds: number, resumeSeconds: number): void {
    if (this.state.status === 'PAUSED') return;
    if (this.state.status !== 'IN_PROGRESS' || expiry(this.state, now, maximumSeconds, resumeSeconds)) throw new EvaluationError('CONFLICT', '정지할 수 없는 평가입니다.');
  }

  assertCanResume(now: Date, maximumSeconds: number, resumeSeconds: number): void {
    if (this.state.status !== 'PAUSED' || expiry(this.state, now, maximumSeconds, resumeSeconds)
      || this.state.questions.some((q) => q.answer && ['PENDING', 'PROCESSING'].includes(q.answer.processingStatus))) throw new EvaluationError('CONFLICT', '현재 재개할 수 없는 평가입니다.');
  }

  get initialDifficulty(): LevelCode { return levels[this.state.startingBandCode]; }
  get isReadyToAnswer(): boolean { return this.state.status === 'IN_PROGRESS' && Boolean(this.state.question?.audioId) && !this.state.question?.answer; }

  started(now: Date): SessionSnapshot {
    this.assertFirstQuestionStage();
    if (!this.state.question?.audioId) throw new EvaluationError('CONFLICT', '질문 음성이 준비되지 않았습니다.');
    return { ...this.state, status: 'IN_PROGRESS', startedAt: this.state.startedAt ?? now };
  }
}

export function validateQuestion(content: string): string {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 500 || /[\r\n]/.test(trimmed) || !/[a-zA-Z]/.test(trimmed)
    || /[가-힣]/.test(trimmed) || !trimmed.endsWith('?') || (trimmed.match(/\?/g)?.length ?? 0) !== 1) {
    throw new ProcessingError('AI_INVALID_OUTPUT', true);
  }
  return trimmed;
}

export function validateNextDifficulty(previous: LevelCode, next: LevelCode): void {
  if (Math.abs(levelCodes.indexOf(previous) - levelCodes.indexOf(next)) > 1) throw new ProcessingError('AI_INVALID_OUTPUT', true);
}

export function expiry(state: SessionSnapshot, now: Date, maximumSeconds: number, resumeSeconds: number) {
  if (state.startedAt && now.getTime() >= state.startedAt.getTime() + maximumSeconds * 1000) return 'TIME_LIMIT' as const;
  if (state.status === 'PAUSED' && state.pausedAt && now.getTime() >= state.pausedAt.getTime() + resumeSeconds * 1000) return 'PAUSE_EXPIRED' as const;
  return null;
}
