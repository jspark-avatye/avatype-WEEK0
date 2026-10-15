import OpenAI from 'openai';
import { ProcessingError } from './processing-error';
import { classifyProviderFailure } from './provider-failure';
function connectionCode(error: unknown): string | undefined {
  let current = error;
  for (let i = 0; i < 3 && typeof current === 'object' && current !== null; i++) {
    if ('code' in current && typeof current.code === 'string' && ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPERM', 'EACCES', 'ENETUNREACH'].includes(current.code)) return current.code;
    current = 'cause' in current ? current.cause : null;
  }
  return undefined;
}
export function classifyAIError(error: unknown): ProcessingError {
  if (error instanceof ProcessingError) return error;
  if (error instanceof OpenAI.APIError) return classifyProviderFailure({ status: error.status, code: error.code ?? connectionCode(error), param: error.param ?? undefined, requestId: error.requestID ?? undefined, retryAfter: error.headers?.get('retry-after'), timeout: error instanceof OpenAI.APIConnectionTimeoutError });
  return classifyProviderFailure({});
}
