/** Framework-free failures shared by internal use cases and external adapters. */
export class ProcessingError extends Error {
  constructor(readonly publicCode: string, readonly retryable: boolean, readonly retryAfterAt: string | null = null, readonly diagnostic: { status?: number; code?: string; param?: string; requestId?: string; reason?: string; finishReason?: string; toolCallCount?: number } | null = null) { super(publicCode); }
}
