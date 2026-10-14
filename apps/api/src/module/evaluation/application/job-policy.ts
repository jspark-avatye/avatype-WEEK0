import type { JobPhase, JobSnapshot } from './evaluation.contracts';
export function readJobProgress(value: unknown) {
  const p = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const phase: JobPhase = p.phase === 'SYNTHESIZING' ? 'SYNTHESIZING' : p.phase === 'TRANSCRIBING' ? 'TRANSCRIBING' : 'GENERATING_QUESTION';
  const errorCode = typeof p.errorCode === 'string' ? p.errorCode : null;
  return { phase, errorCode, retryable: p.retryable === true || errorCode === 'AI_CONFIGURATION', retryAfterAt: typeof p.retryAfterAt === 'string' ? p.retryAfterAt : null };
}
export function canRetryJob(job: JobSnapshot, maximumExecutions: number, now: Date): boolean {
  return job.state === 'failed' && job.retryable && job.failures < maximumExecutions && (!job.retryAfterAt || Date.parse(job.retryAfterAt) <= now.getTime());
}
