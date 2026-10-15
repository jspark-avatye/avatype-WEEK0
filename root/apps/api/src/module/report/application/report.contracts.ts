import type { EvaluationStatus, ReportAssessment, ReportDocument, ReportProgress, ReportVerdict, CriterionCode } from '@root/trpc-contract';
export type { ReportAssessment, ReportDocument, ReportProgress, ReportVerdict, CriterionCode, HistoryInput, EvaluationHistory } from '@root/trpc-contract';
export const criteria = ['VOCABULARY', 'GRAMMAR', 'PRONUNCIATION', 'FLUENCY', 'RELEVANCE'] as const;
export const levels = ['BEGINNER_LOW', 'BEGINNER_MID', 'BEGINNER_HIGH', 'INTERMEDIATE_LOW', 'INTERMEDIATE_MID', 'INTERMEDIATE_HIGH', 'ADVANCED_LOW', 'ADVANCED_MID', 'ADVANCED_HIGH'] as const;
export type ReportSource = {
  evaluationId: string; userId: string; status: EvaluationStatus; topicCode: string; endReason: string | null;
  answers: { answerId: string; questionId: string; question: string; transcript: string | null; processingStatus: string; objectKey: string; mimeType: string; durationMs: number }[];
};
export type SpeechObservation = {
  answerId: string; transcriptUsable: boolean;
  pronunciation: { assessable: boolean; observation: string };
  fluency: { assessable: boolean; observation: string };
  exclusionReason: string | null;
};
export type AnalyzedTurn = ReportSource['answers'][number] & { speech: SpeechObservation };
export type ValidatedAssessment = ReportAssessment & { verdict: ReportVerdict };
export type ReportJob = {
  state: 'waiting' | 'active' | 'completed' | 'failed'; failures: number;
  stage: ReportProgress['stage']; errorCode: string | null; retryable: boolean; retryAfterAt: string | null;
};
export type { CriterionCode as ReportCriterion, ReportDocument as StoredReport };
