import { ProcessingError } from './processing-error';
export type ProviderFailure = { status?: number; code?: string; param?: string; requestId?: string; retryAfter?: string | null; timeout?: boolean };
export function classifyProviderFailure(input: ProviderFailure, now = Date.now()): ProcessingError {
  const { status, code, param, requestId } = input;
  const diagnostic = { status, code, param, requestId };
  const quota = code === 'insufficient_quota' || code === 'billing_hard_limit_reached' || code === 'billing_not_active' || code === 'usage_limit_reached';
  const retryMs = input.retryAfter ? Number(input.retryAfter) * 1000 : NaN;
  const retryDate = Number.isFinite(retryMs) ? now + retryMs : Date.parse(input.retryAfter ?? '');
  const retryAfter = Number.isFinite(retryDate) ? new Date(Math.max(now, retryDate)).toISOString() : null;
  if (quota) return new ProcessingError('AI_QUOTA_EXCEEDED', true, null, diagnostic);
  if (status === 401) return new ProcessingError('AI_AUTH_FAILED', true, null, diagnostic);
  if (status === 403) return new ProcessingError('AI_ACCESS_DENIED', true, null, diagnostic);
  if (status === 404 || code === 'model_not_found') return new ProcessingError('AI_MODEL_UNAVAILABLE', true, null, diagnostic);
  if (status === 400 || status === 422) return new ProcessingError('AI_INVALID_REQUEST', true, null, diagnostic);
  if (status === 429) return new ProcessingError('AI_RATE_LIMITED', true, retryAfter, diagnostic);
  return new ProcessingError(input.timeout ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE', true, null, diagnostic);
}
