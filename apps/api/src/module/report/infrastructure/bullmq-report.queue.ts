import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import type { ReportJobs } from '../application/report.ports';
import type { ReportJob, ReportProgress } from '../application/report.contracts';
import { canRetry } from '../domain/report-policy';
import { ReportError } from '../domain/report-error';
import { ProcessingError } from '../../../shared/processing-error';
import { ReportConfig } from './report-config';
type Input = { evaluationId: string };
export function reportJobId(evaluationId: string) { return `report-${evaluationId}`; }
function connection(url: string) {
  const parsed = new URL(url); if (!['redis:', 'rediss:'].includes(parsed.protocol)) throw new Error('Invalid REDIS_URL');
  return { host: parsed.hostname, port: Number(parsed.port || 6379), username: parsed.username ? decodeURIComponent(parsed.username) : undefined, password: parsed.password ? decodeURIComponent(parsed.password) : undefined, db: Number(parsed.pathname.slice(1) || 0), ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}) };
}
function metadata(job: Job<Input, void>) {
  const p = typeof job.progress === 'object' && job.progress !== null ? job.progress as Record<string, unknown> : {};
  const stage: ReportProgress['stage'] = p.stage === 'ANALYZING_AUDIO' || p.stage === 'GENERATING_REPORT' || p.stage === 'SAVING_REPORT' ? p.stage : 'QUEUED';
  return { stage, errorCode: typeof p.errorCode === 'string' ? p.errorCode : null, retryable: p.retryable === true, retryAfterAt: typeof p.retryAfterAt === 'string' ? p.retryAfterAt : null };
}
@Injectable()
export class BullMQReportQueue implements ReportJobs, OnModuleDestroy {
  private readonly queue: Queue<Input, void>;
  private worker: Worker<Input, void> | null = null;
  private readonly logger = new Logger(BullMQReportQueue.name);
  constructor(private readonly config: ReportConfig) {
    this.queue = new Queue<Input, void>('report-analysis', { connection: { ...connection(config.redisUrl), maxRetriesPerRequest: 1, enableOfflineQueue: false } });
    this.queue.on('error', () => this.logger.warn('Report queue connection unavailable'));
  }
  startWorker(handler: (evaluationId: string, progress: (stage: ReportProgress['stage']) => Promise<void>) => Promise<void>) {
    this.worker = new Worker<Input, void>('report-analysis', async (job) => {
      try { await handler(job.data.evaluationId, async (stage) => { await job.updateProgress({ stage }); }); }
      catch (error) {
        const failure = error instanceof ProcessingError ? error : error instanceof ReportError && error.code === 'UNAUTHORIZED' ? new ProcessingError('ACCOUNT_INACTIVE', false) : new ProcessingError('PROCESSING_FAILED', true);
        await job.updateProgress({ ...metadata(job), errorCode: failure.publicCode, retryable: failure.retryable, retryAfterAt: failure.retryAfterAt });
        throw new Error(failure.publicCode);
      }
    }, { connection: { ...connection(this.config.redisUrl), maxRetriesPerRequest: null }, concurrency: 1 });
    this.worker.on('error', () => this.logger.warn('Report worker connection unavailable'));
  }
  async enqueue(evaluationId: string) {
    try { await this.queue.add('analyze', { evaluationId }, { jobId: reportJobId(evaluationId), attempts: 1, removeOnComplete: false, removeOnFail: false }); }
    catch { throw new ReportError('INTERNAL_SERVER_ERROR', '회화는 저장됐지만 보고서 분석을 시작하지 못했습니다. 다시 시작해 주세요.'); }
  }
  async get(evaluationId: string): Promise<ReportJob | null> {
    try {
      const job = await this.queue.getJob(reportJobId(evaluationId)); if (!job) return null;
      const state = await job.getState();
      return { ...metadata(job), failures: job.attemptsMade, state: state === 'active' || state === 'completed' || state === 'failed' ? state : 'waiting' };
    } catch { throw new ReportError('INTERNAL_SERVER_ERROR', '분석 작업 상태를 조회하지 못했습니다. 잠시 후 확인해 주세요.'); }
  }
  async retry(evaluationId: string) {
    const job = await this.queue.getJob(reportJobId(evaluationId)); const state = await this.get(evaluationId);
    if (!job || !state || !canRetry(state, new Date())) throw new ReportError('CONFLICT', '현재 분석은 재시도할 수 없습니다.');
    try { await job.retry('failed'); }
    catch { throw new ReportError('CONFLICT', '작업이 이미 재시도 중이거나 큐에 연결할 수 없습니다. 상태를 다시 확인해 주세요.'); }
  }
  async onModuleDestroy() { await this.worker?.close(); await this.queue.close(); }
}
