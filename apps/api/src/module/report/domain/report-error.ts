export class ReportError extends Error {
  constructor(readonly code: 'BAD_REQUEST' | 'CONFLICT' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'INTERNAL_SERVER_ERROR', message: string) { super(message); }
}
