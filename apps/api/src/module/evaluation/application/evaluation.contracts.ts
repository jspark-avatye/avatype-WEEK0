export type TopicCode = 'DAILY_LIFE' | 'TRAVEL' | 'WORK';
export type StartingBand = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export const levelCodes = [
  'BEGINNER_LOW', 'BEGINNER_MID', 'BEGINNER_HIGH',
  'INTERMEDIATE_LOW', 'INTERMEDIATE_MID', 'INTERMEDIATE_HIGH',
  'ADVANCED_LOW', 'ADVANCED_MID', 'ADVANCED_HIGH',
] as const;
export type LevelCode = typeof levelCodes[number];
export type SessionStatus = 'READY' | 'IN_PROGRESS' | 'PAUSED' | 'ENDING' | 'ANALYSIS_PENDING' | 'ANALYZING' | 'COMPLETED' | 'ANALYSIS_FAILED';
export type EndReason = 'USER_ENDED' | 'TIME_LIMIT' | 'PAUSE_EXPIRED' | 'SUFFICIENT_EVIDENCE';
export type AnswerStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type CreateEvaluation = { evaluationId: string; topicCode: TopicCode; startingBandCode: StartingBand };
export type AudioMetadata = { audioId: string; objectKey: string; mimeType: string; byteSize: number; durationMs: number };
export type AnswerSnapshot = { answerId: string; questionId: string; audio: AudioMetadata; transcript: string | null; processingStatus: AnswerStatus; acceptedAt: Date };
export type QuestionSnapshot = { questionId: string; questionNo: number; content: string; difficultyLevelCode: LevelCode; audioId: string | null; answer: AnswerSnapshot | null };
export type SessionSnapshot = CreateEvaluation & {
  userId: string; status: SessionStatus; createdAt: Date; startedAt: Date | null; pausedAt: Date | null;
  endedAt: Date | null; endReason: EndReason | null; questions: QuestionSnapshot[];
  question: QuestionSnapshot | null; latestAnswer: AnswerSnapshot | null;
};
export type SubmitAnswer = { evaluationId: string; questionId: string; bytes: Uint8Array; mimeType: string };
export type JobPhase = 'TRANSCRIBING' | 'GENERATING_QUESTION' | 'SYNTHESIZING';
export type TurnJob = { kind: 'START'; evaluationId: string } | { kind: 'ANSWER'; evaluationId: string; answerId: string; audioId: string };
export type ConversationJob = TurnJob | { kind: 'SESSION_EXPIRY'; evaluationId: string; at: string } | { kind: 'PAUSE_EXPIRY'; evaluationId: string; at: string };
export type JobSnapshot = {
  state: 'waiting' | 'active' | 'completed' | 'failed'; phase: JobPhase; failures: number;
  errorCode: string | null; retryable: boolean; retryAfterAt: string | null;
};
export type Progress = {
  evaluationId: string; topicCode: TopicCode; startingBandCode: StartingBand; status: SessionStatus;
  phase: 'IDLE' | JobPhase | 'READY_TO_ANSWER' | 'FAILED' | 'FINISHED';
  createdAt: string; startedAt: string | null; pausedAt: string | null; endedAt: string | null; expiresAt: string | null;
  endReason: EndReason | null;
  question: { questionId: string; questionNo: number; content: string; difficultyLevelCode: LevelCode; audioId: string } | null;
  latestAnswer: { answerId: string; questionId: string; processingStatus: AnswerStatus } | null;
  errorCode: string | null; retryAvailable: boolean; retryAfterAt: string | null;
  actions: { canRecord: boolean; canSubmit: boolean; canPause: boolean; canResume: boolean; canEnd: boolean };
};
export type Options = {
  topics: { code: TopicCode; label: string; description: string }[];
  startingBands: { code: StartingBand; label: string }[];
  maximumDurationSeconds: number;
};
export type NextTurn = { action: 'ASK'; questionContent: string; difficultyLevelCode: LevelCode } | { action: 'END'; questionContent: null; difficultyLevelCode: null };
export type DialogueTurn = { question: string; difficulty: LevelCode; transcript: string };
