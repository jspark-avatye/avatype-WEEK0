export const topicCodes = ['DAILY_LIFE', 'TRAVEL', 'WORK'] as const;
export const startingBands = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export const proficiencyLevels = [
  'BEGINNER_LOW', 'BEGINNER_MID', 'BEGINNER_HIGH',
  'INTERMEDIATE_LOW', 'INTERMEDIATE_MID', 'INTERMEDIATE_HIGH',
  'ADVANCED_LOW', 'ADVANCED_MID', 'ADVANCED_HIGH',
] as const;

export type TopicCode = typeof topicCodes[number];
export type StartingBandCode = typeof startingBands[number];
export type ProficiencyLevelCode = typeof proficiencyLevels[number];
export type CreateEvaluationInput = {
  evaluationId: string;
  topicCode: TopicCode;
  startingBandCode: StartingBandCode;
};
export type EvaluationOptions = {
  topics: { code: TopicCode; label: string; description: string }[];
  startingBands: { code: StartingBandCode; label: string }[];
  maximumDurationSeconds: number;
};
export type EvaluationStatus = 'READY' | 'IN_PROGRESS' | 'PAUSED' | 'ENDING' | 'ANALYSIS_PENDING' | 'ANALYZING' | 'COMPLETED' | 'ANALYSIS_FAILED';
export type EvaluationProgress = {
  evaluationId: string; topicCode: TopicCode; startingBandCode: StartingBandCode; status: EvaluationStatus;
  phase: 'IDLE' | 'TRANSCRIBING' | 'GENERATING_QUESTION' | 'SYNTHESIZING' | 'READY_TO_ANSWER' | 'FAILED' | 'FINISHED';
  createdAt: string; startedAt: string | null; pausedAt: string | null; endedAt: string | null; expiresAt: string | null;
  endReason: 'USER_ENDED' | 'TIME_LIMIT' | 'PAUSE_EXPIRED' | 'SUFFICIENT_EVIDENCE' | null;
  question: { questionId: string; questionNo: number; content: string; difficultyLevelCode: ProficiencyLevelCode; audioId: string } | null;
  latestAnswer: { answerId: string; questionId: string; processingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' } | null;
  errorCode: string | null; retryAvailable: boolean; retryAfterAt: string | null;
  actions: { canRecord: boolean; canSubmit: boolean; canPause: boolean; canResume: boolean; canEnd: boolean };
};
export interface EvaluationRpcController {
  options(userId: string): Promise<EvaluationOptions>;
  create(userId: string, input: CreateEvaluationInput): Promise<{ evaluationId: string; status: EvaluationStatus }>;
  start(userId: string, evaluationId: string): Promise<EvaluationProgress>;
  get(userId: string, evaluationId: string): Promise<EvaluationProgress>;
  retry(userId: string, evaluationId: string): Promise<EvaluationProgress>;
  submitAnswer(userId: string, input: FormData): Promise<EvaluationProgress>;
  pause(userId: string, evaluationId: string): Promise<EvaluationProgress>;
  resume(userId: string, evaluationId: string): Promise<EvaluationProgress>;
  end(userId: string, evaluationId: string): Promise<EvaluationProgress>;
  resumable(userId: string): Promise<EvaluationProgress[]>;
  audio(userId: string, audioId: string): Promise<{ mimeType: string; audioBase64: string }>;
}
