import type { AnalyzedTurn, EvaluationHistory, HistoryInput, ReportAssessment, ReportDocument, ReportJob, ReportProgress, ReportSource, SpeechObservation, ValidatedAssessment } from './report.contracts';
export { ReportError } from '../domain/report-error';
export { ProcessingError } from '../../../shared/processing-error';
export const REPORT_USE_CASE = Symbol('REPORT_USE_CASE');
export const REPORT_ANALYSIS_USE_CASE = Symbol('REPORT_ANALYSIS_USE_CASE');
export interface ReportAccounts { checkActive(userId: string): Promise<void> }
export interface ReportAudio { read(objectKey: string): Promise<Uint8Array> }
export interface ReportAudioPreparation { wav(bytes: Uint8Array): Promise<Uint8Array> }
export interface ReportAI {
  observe(input: { answerId: string; question: string; transcript: string; wav: Uint8Array }): Promise<SpeechObservation>;
  assess(input: { topicCode: string; endReason: string | null; turns: AnalyzedTurn[]; excluded: { answerId: string; reason: string }[] }): Promise<ReportAssessment>;
}
export interface ReportRepository {
  source(evaluationId: string): Promise<ReportSource | null>;
  document(evaluationId: string): Promise<ReportDocument | null>;
  claim(evaluationId: string): Promise<boolean>;
  fail(evaluationId: string): Promise<void>;
  prepareRetry(evaluationId: string): Promise<boolean>;
  restoreFailure(evaluationId: string): Promise<void>;
  save(evaluationId: string, result: ValidatedAssessment, eligible: Record<string, string[]>): Promise<void>;
  history(userId: string, input: HistoryInput): Promise<EvaluationHistory>;
  evidenceAudio(userId: string, evaluationId: string, answerId: string): Promise<{ mimeType: string; objectKey: string } | null>;
}
export interface ReportJobs {
  enqueue(evaluationId: string): Promise<void>;
  get(evaluationId: string): Promise<ReportJob | null>;
  retry(evaluationId: string): Promise<void>;
}
export interface ReportUseCase {
  ensureScheduled(evaluationId: string): Promise<void>;
  analyze(userId: string, evaluationId: string): Promise<ReportProgress>;
  get(userId: string, evaluationId: string): Promise<ReportProgress>;
  retry(userId: string, evaluationId: string): Promise<ReportProgress>;
  history(userId: string, input: HistoryInput): Promise<EvaluationHistory>;
  answerAudio(userId: string, evaluationId: string, answerId: string): Promise<{ mimeType: string; bytes: Uint8Array }>;
}
export interface ReportAnalysisUseCase {
  process(evaluationId: string, progress: (stage: ReportProgress['stage']) => Promise<void>): Promise<void>;
}
