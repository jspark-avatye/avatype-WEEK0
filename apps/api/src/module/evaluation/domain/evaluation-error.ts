import { ProcessingError } from '../../../shared/processing-error';
export { ProcessingError } from '../../../shared/processing-error';
export type EvaluationErrorCode = 'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT' | 'UNAUTHORIZED' | 'INTERNAL_SERVER_ERROR';
export class EvaluationError extends Error {
  constructor(readonly code: EvaluationErrorCode, message: string) { super(message); }
}

export function processingFailure(error: unknown): ProcessingError {
  if (error instanceof ProcessingError) return error;
  if (error instanceof EvaluationError && error.code === 'UNAUTHORIZED') return new ProcessingError('ACCOUNT_INACTIVE', false);
  return new ProcessingError('PROCESSING_FAILED', true);
}
