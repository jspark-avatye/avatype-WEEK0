import type { AnswerSnapshot, AudioMetadata, ConversationJob, CreateEvaluation, DialogueTurn, EndReason, JobPhase, JobSnapshot, LevelCode, NextTurn, Options, Progress, QuestionSnapshot, SessionSnapshot, SubmitAnswer, TopicCode, TurnJob } from './evaluation.contracts';
export { EvaluationError, ProcessingError } from '../domain/evaluation-error';
export const EVALUATION_USE_CASE = Symbol('EVALUATION_USE_CASE');
export const CONVERSATION_USE_CASE = Symbol('CONVERSATION_USE_CASE');
export interface ActiveAccounts { checkActive(userId: string): Promise<void> }
export interface ReportDispatch { ensureScheduled(evaluationId: string): Promise<void> }
export interface EvaluationRepository {
  create(input: CreateEvaluation & { userId: string }): Promise<SessionSnapshot>;
  find(evaluationId: string): Promise<SessionSnapshot | null>;
  resumable(userId: string): Promise<string[]>;
  saveQuestion(evaluationId: string, content: string, difficulty: LevelCode, input?: Extract<TurnJob, { kind: 'ANSWER' }>): Promise<QuestionSnapshot | null>;
  completeQuestion(evaluationId: string, questionId: string, audio: AudioMetadata, now: Date, input?: Extract<TurnJob, { kind: 'ANSWER' }>): Promise<boolean>;
  acceptAnswer(userId: string, input: SubmitAnswer, answerId: string, audio: AudioMetadata, now: Date, replace: boolean): Promise<{ accepted: boolean; answer: AnswerSnapshot; oldAudio: AudioMetadata | null }>;
  beginAnswer(input: Extract<TurnJob, { kind: 'ANSWER' }>): Promise<boolean>;
  saveTranscript(input: Extract<TurnJob, { kind: 'ANSWER' }>, text: string): Promise<boolean>;
  completeAnswer(input: Extract<TurnJob, { kind: 'ANSWER' }>, now: Date): Promise<void>;
  failAnswer(input: Extract<TurnJob, { kind: 'ANSWER' }>): Promise<void>;
  pause(evaluationId: string, now: Date): Promise<void>;
  resume(evaluationId: string, now: Date): Promise<void>;
  end(evaluationId: string, reason: EndReason, now: Date, expectedPausedAt?: string): Promise<void>;
  findQuestionAudio(userId: string, audioId: string): Promise<AudioMetadata | null>;
}
export interface AudioStorage {
  save(objectKey: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  read(objectKey: string): Promise<Uint8Array>;
  remove(objectKey: string): Promise<void>;
}
export interface AudioInspector {
  inspectMp3(bytes: Uint8Array): Promise<{ byteSize: number; durationMs: number }>;
  inspectAnswer(bytes: Uint8Array, mimeType: string): Promise<{ byteSize: number; durationMs: number; mimeType: string; extension: string }>;
}
export interface ConversationAI {
  generateQuestion(input: { topic: string; startingBand: string; difficulty: LevelCode }): Promise<string>;
  transcribe(bytes: Uint8Array, mimeType: string): Promise<string>;
  decideNextTurn(input: { topic: string; history: DialogueTurn[]; elapsedSeconds: number }): Promise<NextTurn>;
  synthesize(content: string): Promise<Uint8Array>;
}
export interface ConversationJobs {
  enqueue(input: TurnJob): Promise<void>;
  get(input: TurnJob): Promise<JobSnapshot | null>;
  retry(input: TurnJob): Promise<void>;
  schedule(input: Extract<ConversationJob, { kind: 'SESSION_EXPIRY' | 'PAUSE_EXPIRY' }>, due: Date): Promise<void>;
}
export interface EvaluationSettings {
  options(): Options;
  topicContext(code: TopicCode): string;
  readonly maximumExecutions: number;
  readonly maximumAnswerBytes: number;
  readonly maximumDurationSeconds: number;
  readonly resumeWindowSeconds: number;
}
export interface EvaluationUseCase {
  options(userId: string): Promise<Options>;
  create(userId: string, input: CreateEvaluation): Promise<{ evaluationId: string; status: SessionSnapshot['status'] }>;
  start(userId: string, evaluationId: string): Promise<Progress>;
  get(userId: string, evaluationId: string): Promise<Progress>;
  retry(userId: string, evaluationId: string): Promise<Progress>;
  submitAnswer(userId: string, input: SubmitAnswer): Promise<Progress>;
  pause(userId: string, evaluationId: string): Promise<Progress>;
  resume(userId: string, evaluationId: string): Promise<Progress>;
  end(userId: string, evaluationId: string): Promise<Progress>;
  resumable(userId: string): Promise<Progress[]>;
  audio(userId: string, audioId: string): Promise<{ mimeType: string; bytes: Uint8Array }>;
}
export interface ConversationUseCase {
  process(input: ConversationJob, progress: (phase: JobPhase) => Promise<void>): Promise<void>;
}
