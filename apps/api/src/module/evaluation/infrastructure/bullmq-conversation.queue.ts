import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import type { ConversationJobs } from '../application/evaluation.ports';
import type { ConversationJob, JobPhase, JobSnapshot, TurnJob } from '../application/evaluation.contracts';
import { EvaluationError, processingFailure } from '../domain/evaluation-error';
import { readJobProgress, canRetryJob } from '../application/job-policy';
import { EvaluationConfig } from './evaluation-config';
type WorkerHandler = (input: ConversationJob, progress: (phase: JobPhase) => Promise<void>) => Promise<void>;
export function turnJobId(input: TurnJob) { return input.kind === 'START' ? `start-${input.evaluationId}` : `answer-${input.answerId}-${input.audioId}`; }
function connection(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') throw new Error('Invalid REDIS_URL');
  return { host: parsed.hostname, port: Number(parsed.port || 6379), username: parsed.username ? decodeURIComponent(parsed.username) : undefined, password: parsed.password ? decodeURIComponent(parsed.password) : undefined, db: Number(parsed.pathname.slice(1) || 0), ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}) };
}
function jobProgress(job: Job<ConversationJob, void>) { return readJobProgress(job.progress); }
@Injectable()
export class BullMQConversationQueue implements ConversationJobs, OnModuleDestroy {
  private readonly logger = new Logger(BullMQConversationQueue.name);
  private readonly queue: Queue<ConversationJob, void>;
  private worker: Worker<ConversationJob, void> | null = null;
  constructor(private readonly config: EvaluationConfig) {
    this.queue = new Queue<ConversationJob, void>('conversation', { connection: { ...connection(config.redisUrl), maxRetriesPerRequest: 1, enableOfflineQueue: false } });
    this.queue.on('error', () => this.logger.warn('Conversation queue connection unavailable'));
  }
  startWorker(handler: WorkerHandler) {
    this.worker = new Worker<ConversationJob, void>('conversation', async (job) => {
      try {
        // First-question jobs persisted by the previous version have no discriminant.
        const data: ConversationJob | { evaluationId: string } = job.data;
        const input = 'kind' in data ? data : { kind: 'START' as const, evaluationId: data.evaluationId };
        await handler(input, async (phase) => { await job.updateProgress({ phase }); });
      } catch (error) {
        const failure = processingFailure(error);
        await job.updateProgress({ ...jobProgress(job), errorCode: failure.publicCode, retryable: failure.retryable, retryAfterAt: failure.retryAfterAt });
        throw new Error(failure.publicCode);
      }
    }, { connection: { ...connection(this.config.redisUrl), maxRetriesPerRequest: null }, concurrency: 1 });
    this.worker.on('error', () => this.logger.warn('Conversation worker connection unavailable'));
  }
  async enqueue(input: TurnJob) {
    try { await this.queue.add(input.kind.toLowerCase(), input, { jobId: turnJobId(input), attempts: 1, removeOnComplete: false, removeOnFail: false }); }
    catch { throw new EvaluationError('INTERNAL_SERVER_ERROR', '입력은 저장됐지만 AI 작업을 시작하지 못했습니다. 다시 시도해 주세요.'); }
  }
  async schedule(input: Extract<ConversationJob, { kind: 'SESSION_EXPIRY' | 'PAUSE_EXPIRY' }>, due: Date) {
    try { await this.queue.add(input.kind.toLowerCase(), input, { jobId: `${input.kind}-${input.evaluationId}-${new Date(input.at).getTime()}`, delay: Math.max(0, due.getTime() - Date.now()), attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: false }); }
    catch { throw new EvaluationError('INTERNAL_SERVER_ERROR', '시간 제한 작업을 등록하지 못했습니다. 진행 상태를 다시 확인해 주세요.'); }
  }
  async get(input: TurnJob): Promise<JobSnapshot | null> {
    try {
      const job = await this.queue.getJob(turnJobId(input)); if (!job) return null;
      const state = await job.getState();
      return { ...jobProgress(job), state: state === 'failed' || state === 'completed' || state === 'active' ? state : 'waiting', failures: job.attemptsMade };
    } catch { throw new EvaluationError('INTERNAL_SERVER_ERROR', '작업 상태를 조회하지 못했습니다. 잠시 후 확인해 주세요.'); }
  }
  async retry(input: TurnJob) {
    const job = await this.queue.getJob(turnJobId(input));
    if (!job || await job.getState() !== 'failed' || !canRetryJob({ ...jobProgress(job), state: 'failed', failures: job.attemptsMade }, this.config.maximumExecutions, new Date())) throw new EvaluationError('CONFLICT', '현재 작업을 재시도할 수 없습니다.');
    try { await job.retry('failed'); }
    catch { throw new EvaluationError('CONFLICT', '작업이 이미 재시도 중입니다. 진행 상태를 확인해 주세요.'); }
  }
  async onModuleDestroy() { await this.worker?.close(); await this.queue.close(); }
}
