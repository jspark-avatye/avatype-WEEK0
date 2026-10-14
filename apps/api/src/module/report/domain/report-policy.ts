import type { AnalyzedTurn, CriterionCode, ReportAssessment, ReportJob, SpeechObservation, ValidatedAssessment } from '../application/report.contracts';
import { criteria, levels } from '../application/report.contracts';
import { ProcessingError } from '../../../shared/processing-error';
export function invalid(reason?: string, param?: string): never { throw new ProcessingError('AI_INVALID_OUTPUT', true, null, reason ? { reason, param } : null); }
export function record(value: unknown, param?: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid('EXPECTED_OBJECT', param);
  return value as Record<string, unknown>;
}
export function text(value: unknown, maximum = 6000, param?: string): string {
  if (typeof value !== 'string') return invalid('EXPECTED_STRING', param);
  if (!value.trim()) return invalid('EMPTY_STRING', param);
  if (value.length > maximum) return invalid('TEXT_TOO_LONG', param);
  return value.trim();
}
function array(value: unknown, maximum: number): unknown[] { if (!Array.isArray(value) || value.length > maximum) return invalid(); return value; }
export function parseSpeech(value: unknown, answerId: string): SpeechObservation {
  const input = record(value, 'speech');
  if (typeof input.transcriptUsable !== 'boolean') return invalid('EXPECTED_BOOLEAN', 'transcriptUsable');
  const observation = (value: unknown, field: string) => { const o = record(value, field); if (typeof o.assessable !== 'boolean') return invalid('EXPECTED_BOOLEAN', `${field}.assessable`); return { assessable: o.assessable, observation: text(o.observation, 2000, `${field}.observation`) }; };
  const reason = input.exclusionReason === null ? null : text(input.exclusionReason, 2000, 'exclusionReason');
  if (input.transcriptUsable === (reason !== null)) return invalid('TRANSCRIPT_REASON_MISMATCH', 'exclusionReason');
  return { answerId, transcriptUsable: input.transcriptUsable, pronunciation: observation(input.pronunciation, 'pronunciation'), fluency: observation(input.fluency, 'fluency'), exclusionReason: reason };
}
export function parseAssessment(value: unknown): ReportAssessment {
  const input = record(value);
  const level = input.finalLevelCode === null ? null : levels.find((l) => l === input.finalLevelCode);
  if (level === undefined) return invalid();
  const list = array(input.criteria, 5);
  if (list.length !== 5) return invalid();
  const results = list.map((item) => {
    const r = record(item); const code = criteria.find((c) => c === r.criterionCode); if (!code) return invalid();
    const score = r.score;
    if (score !== null && (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100)) return invalid();
    const reason = r.insufficientReason === null ? null : text(r.insufficientReason);
    if ((score === null) !== (reason !== null)) return invalid();
    const evidence = array(r.evidence, 3).map((value) => { const e = record(value); return { answerId: text(e.answerId, 36), explanation: text(e.explanation) }; });
    const feedback = array(r.feedback, 3).map((value): ReportAssessment['criteria'][number]['feedback'][number] => {
      const f = record(value); const kind = f.feedbackKind;
      if (kind !== 'IMPROVEMENT' && kind !== 'EXPRESSION_CORRECTION') return invalid();
      return { feedbackKind: kind, suggestion: text(f.suggestion), explanation: text(f.explanation) };
    });
    if (score !== null ? !evidence.length || !feedback.length : evidence.length !== 0 || feedback.length !== 0) return invalid();
    if (new Set(evidence.map((e) => e.answerId)).size !== evidence.length) return invalid();
    return { criterionCode: code, score, insufficientReason: reason, rationale: text(r.rationale), evidence, feedback };
  });
  if (new Set(results.map((r) => r.criterionCode)).size !== 5) return invalid();
  return { finalLevelCode: level, summary: text(input.summary), criteria: criteria.map((code) => results.find((r) => r.criterionCode === code)!) };
}
export function eligibleAnswers(turns: AnalyzedTurn[]): Record<CriterionCode, string[]> {
  return Object.fromEntries(criteria.map((code) => [code, turns.filter((t) => code === 'PRONUNCIATION' ? t.speech.pronunciation.assessable : code === 'FLUENCY' ? t.speech.fluency.assessable : t.speech.transcriptUsable).map((t) => t.answerId)])) as Record<CriterionCode, string[]>;
}
export function validateAssessment(input: ReportAssessment, turns: AnalyzedTurn[]): ValidatedAssessment {
  const result = parseAssessment(input); const eligible = eligibleAnswers(turns);
  for (const r of result.criteria) {
    if (r.evidence.some((e) => !eligible[r.criterionCode].includes(e.answerId))) return invalid();
  }
  const usable = turns.filter((t) => t.speech.transcriptUsable).length;
  if (usable === 0 && result.finalLevelCode !== null) return invalid();
  if (!turns.length && result.criteria.some((r) => r.score !== null)) return invalid();
  const verdict = result.finalLevelCode === null ? 'UNASSESSABLE' : usable >= 5 && result.criteria.every((r) => r.score !== null) ? 'CONFIRMED' : 'PROVISIONAL';
  return { ...result, verdict };
}
export function insufficientAssessment(reason: string): ValidatedAssessment {
  return { finalLevelCode: null, verdict: 'UNASSESSABLE', summary: reason,
    criteria: criteria.map((criterionCode) => ({ criterionCode, score: null, insufficientReason: reason, rationale: reason, evidence: [], feedback: [] })),
  };
}
export function canRetry(job: ReportJob, now: Date): boolean {
  return job.state === 'failed' && job.retryable && job.failures < 3 && (!job.retryAfterAt || Date.parse(job.retryAfterAt) <= now.getTime());
}
