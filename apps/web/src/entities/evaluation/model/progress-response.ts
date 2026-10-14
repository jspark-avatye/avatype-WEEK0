import type { EvaluationProgress } from '@root/trpc-contract';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function date(value: unknown, nullable = true): boolean {
  return (nullable && value === null) || (text(value) && Number.isFinite(Date.parse(value)));
}

const statuses = ['READY', 'IN_PROGRESS', 'PAUSED', 'ENDING', 'ANALYSIS_PENDING', 'ANALYZING', 'COMPLETED', 'ANALYSIS_FAILED'];
const phases = ['IDLE', 'TRANSCRIBING', 'GENERATING_QUESTION', 'SYNTHESIZING', 'READY_TO_ANSWER', 'FAILED', 'FINISHED'];
const levels = ['BEGINNER_LOW', 'BEGINNER_MID', 'BEGINNER_HIGH', 'INTERMEDIATE_LOW', 'INTERMEDIATE_MID', 'INTERMEDIATE_HIGH', 'ADVANCED_LOW', 'ADVANCED_MID', 'ADVANCED_HIGH'];

function validQuestion(value: unknown): boolean {
  return value === null || (object(value) && text(value.questionId) && Number.isInteger(value.questionNo)
    && Number(value.questionNo) > 0 && text(value.content) && text(value.audioId)
    && typeof value.difficultyLevelCode === 'string' && levels.includes(value.difficultyLevelCode));
}

function validAnswer(value: unknown): boolean {
  return value === null || (object(value) && text(value.answerId) && text(value.questionId)
    && typeof value.processingStatus === 'string' && ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(value.processingStatus));
}

function validActions(value: unknown): boolean {
  return object(value) && ['canRecord', 'canSubmit', 'canPause', 'canResume', 'canEnd'].every((key) => typeof value[key] === 'boolean');
}

/** HTTP responses must be checked at runtime; a TypeScript contract cannot validate a running API. */
export function parseEvaluationProgress(value: unknown): EvaluationProgress {
  const valid = object(value) && text(value.evaluationId)
    && typeof value.topicCode === 'string' && ['DAILY_LIFE', 'TRAVEL', 'WORK'].includes(value.topicCode)
    && typeof value.startingBandCode === 'string' && ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(value.startingBandCode)
    && typeof value.status === 'string' && statuses.includes(value.status)
    && typeof value.phase === 'string' && phases.includes(value.phase)
    && date(value.createdAt, false) && date(value.startedAt) && date(value.pausedAt) && date(value.endedAt) && date(value.expiresAt)
    && (value.endReason === null || (typeof value.endReason === 'string' && ['USER_ENDED', 'TIME_LIMIT', 'PAUSE_EXPIRED', 'SUFFICIENT_EVIDENCE'].includes(value.endReason)))
    && validQuestion(value.question) && validAnswer(value.latestAnswer)
    && (value.errorCode === null || text(value.errorCode)) && typeof value.retryAvailable === 'boolean' && date(value.retryAfterAt)
    && validActions(value.actions);
  if (!valid) throw new Error('평가 정보를 불러오지 못했습니다. 서비스 업데이트 후 다시 확인해 주세요.');
  return value as EvaluationProgress;
}

export function parseResumableEvaluations(value: unknown): EvaluationProgress[] {
  if (!Array.isArray(value)) throw new Error('이어서 할 평가 목록을 불러오지 못했습니다. 다시 확인해 주세요.');
  return value.map(parseEvaluationProgress);
}
