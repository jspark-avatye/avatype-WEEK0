import { proficiencyLevels } from '@root/trpc-contract/evaluation';
import { criterionCodes, type CriterionAssessment, type EvaluationHistory, type ReportDocument, type ReportProgress } from '@root/trpc-contract/report';
function object(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function text(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0; }
function date(v: unknown): boolean { return text(v) && Number.isFinite(Date.parse(v)); }
function nullableText(v: unknown): boolean { return v === null || text(v); }
function level(v: unknown): boolean { return v === null || proficiencyLevels.some((l) => l === v); }
const verdicts = ['CONFIRMED', 'PROVISIONAL', 'UNASSESSABLE'];
const statuses = ['READY', 'IN_PROGRESS', 'PAUSED', 'ENDING', 'ANALYSIS_PENDING', 'ANALYZING', 'COMPLETED', 'ANALYSIS_FAILED'];
function validCriterion(v: unknown): boolean {
  if (!object(v) || !criterionCodes.some((c) => c === v.criterionCode) || !text(v.rationale) || !nullableText(v.insufficientReason)) return false;
  if (v.score !== null && (typeof v.score !== 'number' || !Number.isInteger(v.score) || v.score < 0 || v.score > 100)) return false;
  if ((v.score === null) !== (v.insufficientReason !== null)) return false;
  if (!Array.isArray(v.evidence) || v.evidence.length > 3 || !Array.isArray(v.feedback) || v.feedback.length > 3) return false;
  if (v.score === null ? v.evidence.length !== 0 || v.feedback.length !== 0 : v.evidence.length < 1 || v.feedback.length < 1) return false;
  return v.evidence.every((e: unknown) => object(e) && text(e.answerId) && text(e.questionId) && text(e.question) && text(e.transcript) && text(e.explanation)
    && typeof e.durationMs === 'number' && Number.isSafeInteger(e.durationMs) && e.durationMs > 0 && e.durationMs <= 120000)
    && new Set(v.evidence.map((e: Record<string, unknown>) => e.answerId)).size === v.evidence.length
    && v.feedback.every((f: unknown) => object(f) && ['IMPROVEMENT', 'EXPRESSION_CORRECTION'].includes(String(f.feedbackKind)) && text(f.suggestion) && text(f.explanation));
}
export function parseReportDocument(v: unknown): ReportDocument {
  if (!object(v) || !text(v.reportId) || !text(v.evaluationId) || !level(v.finalLevelCode) || !verdicts.includes(String(v.verdict)) || !text(v.summary) || !date(v.createdAt)
    || (v.verdict === 'UNASSESSABLE') !== (v.finalLevelCode === null) || !Array.isArray(v.criteria) || v.criteria.length !== 5 || !v.criteria.every(validCriterion)
    || new Set(v.criteria.map((c: CriterionAssessment) => c.criterionCode)).size !== 5
    || (v.verdict === 'CONFIRMED' && v.criteria.some((c: CriterionAssessment) => c.score === null))) throw new Error('보고서 정보를 불러오지 못했습니다. 다시 확인해 주세요.');
  return v as ReportDocument;
}
export function parseReportProgress(v: unknown): ReportProgress {
  const stages = ['NOT_STARTED', 'QUEUED', 'ANALYZING_AUDIO', 'GENERATING_REPORT', 'SAVING_REPORT', 'COMPLETED', 'FAILED'];
  if (!object(v) || !text(v.evaluationId) || !['ANALYSIS_PENDING', 'ANALYZING', 'COMPLETED', 'ANALYSIS_FAILED'].includes(String(v.status))
    || !stages.includes(String(v.stage)) || !nullableText(v.errorCode) || typeof v.canStart !== 'boolean' || typeof v.retryAvailable !== 'boolean'
    || !(v.retryAfterAt === null || date(v.retryAfterAt))) throw new Error('분석 상태를 불러오지 못했습니다. 다시 확인해 주세요.');
  if (v.status === 'COMPLETED') {
    const report = parseReportDocument(v.report);
    if (report.evaluationId !== v.evaluationId || v.stage !== 'COMPLETED' || v.canStart || v.retryAvailable || v.errorCode !== null) throw new Error('보고서 상태가 올바르지 않습니다.');
  } else if (v.report !== null || (v.status === 'ANALYSIS_FAILED' && (v.stage !== 'FAILED' || !text(v.errorCode)))) throw new Error('분석 상태가 올바르지 않습니다.');
  return v as ReportProgress;
}
export function parseEvaluationHistory(v: unknown): EvaluationHistory {
  if (!object(v) || typeof v.page !== 'number' || !Number.isInteger(v.page) || v.page < 1 || typeof v.pageSize !== 'number' || !Number.isInteger(v.pageSize) || v.pageSize < 1 || v.pageSize > 50
    || typeof v.total !== 'number' || !Number.isSafeInteger(v.total) || v.total < 0 || !Array.isArray(v.items) || v.items.length > v.pageSize
    || !v.items.every((r: unknown) => object(r) && text(r.evaluationId) && text(r.topicCode) && date(r.createdAt) && (r.startedAt === null || date(r.startedAt))
      && statuses.includes(String(r.status)) && level(r.finalLevelCode) && (r.verdict === null || verdicts.includes(String(r.verdict))))) throw new Error('평가 기록을 불러오지 못했습니다. 다시 확인해 주세요.');
  return v as EvaluationHistory;
}
