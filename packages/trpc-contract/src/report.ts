import type { EvaluationStatus, ProficiencyLevelCode } from './evaluation';
export const criterionCodes = ['VOCABULARY', 'GRAMMAR', 'PRONUNCIATION', 'FLUENCY', 'RELEVANCE'] as const;
export type CriterionCode = typeof criterionCodes[number];
export type ReportVerdict = 'CONFIRMED' | 'PROVISIONAL' | 'UNASSESSABLE';
export type ReportStage = 'NOT_STARTED' | 'QUEUED' | 'ANALYZING_AUDIO' | 'GENERATING_REPORT' | 'SAVING_REPORT' | 'COMPLETED' | 'FAILED';
export type ReportFeedback = { feedbackKind: 'IMPROVEMENT' | 'EXPRESSION_CORRECTION'; suggestion: string; explanation: string };
export type ReportEvidence = { answerId: string; explanation: string };
export type CriterionAssessment = {
  criterionCode: CriterionCode; score: number | null; insufficientReason: string | null; rationale: string;
  evidence: ReportEvidence[]; feedback: ReportFeedback[];
};
export type ReportAssessment = { finalLevelCode: ProficiencyLevelCode | null; summary: string; criteria: CriterionAssessment[] };
export type ReportDocument = {
  reportId: string; evaluationId: string; finalLevelCode: ProficiencyLevelCode | null; verdict: ReportVerdict; summary: string; createdAt: string;
  criteria: (Omit<CriterionAssessment, 'evidence'> & { evidence: (ReportEvidence & { questionId: string; question: string; transcript: string; durationMs: number })[] })[];
};
export type ReportProgress = {
  evaluationId: string; status: 'ANALYSIS_PENDING' | 'ANALYZING' | 'COMPLETED' | 'ANALYSIS_FAILED'; stage: ReportStage;
  errorCode: string | null; canStart: boolean; retryAvailable: boolean; retryAfterAt: string | null; report: ReportDocument | null;
};
export type HistoryInput = { page: number; pageSize: number };
export type EvaluationHistory = {
  page: number; pageSize: number; total: number;
  items: { evaluationId: string; topicCode: string; createdAt: string; startedAt: string | null; status: EvaluationStatus; finalLevelCode: ProficiencyLevelCode | null; verdict: ReportVerdict | null }[];
};
export interface ReportRpcController {
  analyze(userId: string, evaluationId: string): Promise<ReportProgress>;
  get(userId: string, evaluationId: string): Promise<ReportProgress>;
  retry(userId: string, evaluationId: string): Promise<ReportProgress>;
  history(userId: string, input: HistoryInput): Promise<EvaluationHistory>;
  answerAudio(userId: string, evaluationId: string, answerId: string): Promise<{ mimeType: string; audioBase64: string }>;
}
