import type { CreateEvaluation, Progress, SessionSnapshot, SubmitAnswer, TurnJob } from './evaluation.contracts';
import type { ActiveAccounts, AudioInspector, AudioStorage, ConversationJobs, EvaluationRepository, EvaluationSettings, EvaluationUseCase, ReportDispatch } from './evaluation.ports';
import { canRetryJob } from './job-policy';
import { EvaluationSession, expiry } from '../domain/evaluation-session';
import { EvaluationError } from '../domain/evaluation-error';

export function currentJob(snapshot: SessionSnapshot): TurnJob {
  const answer = snapshot.latestAnswer;
  return answer ? { kind: 'ANSWER', evaluationId: snapshot.evaluationId, answerId: answer.answerId, audioId: answer.audio.audioId }
    : { kind: 'START', evaluationId: snapshot.evaluationId };
}

export class EvaluationApplicationService implements EvaluationUseCase {
  constructor(
    private readonly accounts: ActiveAccounts, private readonly repository: EvaluationRepository,
    private readonly storage: AudioStorage, private readonly jobs: ConversationJobs,
    private readonly settings: EvaluationSettings, private readonly inspector: AudioInspector,
    private readonly newId: () => string, private readonly now: () => Date,
    private readonly reports: ReportDispatch,
  ) {}
  async options(userId: string) { await this.accounts.checkActive(userId); return this.settings.options(); }
  async create(userId: string, input: CreateEvaluation) {
    await this.accounts.checkActive(userId);
    const options = this.settings.options();
    if (!options.topics.some((t) => t.code === input.topicCode) || !options.startingBands.some((b) => b.code === input.startingBandCode)) throw new EvaluationError('BAD_REQUEST', '주제와 시작 수준을 선택해 주세요.');
    const snapshot = await this.repository.create({ ...input, userId });
    const session = EvaluationSession.restore(snapshot);
    session.assertOwner(userId); session.assertSameSettings(input);
    return { evaluationId: snapshot.evaluationId, status: snapshot.status };
  }
  private async owned(userId: string, evaluationId: string): Promise<SessionSnapshot> {
    await this.accounts.checkActive(userId);
    const snapshot = await this.repository.find(evaluationId);
    if (!snapshot) throw new EvaluationError('NOT_FOUND', '평가를 찾을 수 없습니다.');
    EvaluationSession.restore(snapshot).assertOwner(userId);
    const reason = expiry(snapshot, this.now(), this.settings.maximumDurationSeconds, this.settings.resumeWindowSeconds);
    if (reason && (snapshot.status === 'IN_PROGRESS' || snapshot.status === 'PAUSED')) {
      await this.repository.end(evaluationId, reason, this.now());
      await this.reports.ensureScheduled(evaluationId);
      return (await this.repository.find(evaluationId))!;
    }
    if (snapshot.startedAt && ['IN_PROGRESS', 'PAUSED'].includes(snapshot.status)) {
      await this.jobs.schedule({ kind: 'SESSION_EXPIRY', evaluationId, at: snapshot.startedAt.toISOString() }, new Date(snapshot.startedAt.getTime() + this.settings.maximumDurationSeconds * 1000));
      if (snapshot.pausedAt) await this.jobs.schedule({ kind: 'PAUSE_EXPIRY', evaluationId, at: snapshot.pausedAt.toISOString() }, new Date(snapshot.pausedAt.getTime() + this.settings.resumeWindowSeconds * 1000));
    }
    return snapshot;
  }
  async start(userId: string, evaluationId: string) {
    const snapshot = await this.owned(userId, evaluationId);
    if (snapshot.status === 'READY') await this.jobs.enqueue({ kind: 'START', evaluationId });
    return this.get(userId, evaluationId);
  }
  async get(userId: string, evaluationId: string): Promise<Progress> {
    const snapshot = await this.owned(userId, evaluationId);
    const answer = snapshot.latestAnswer;
    const settled = answer?.processingStatus === 'COMPLETED';
    const finished = !['READY', 'IN_PROGRESS', 'PAUSED', 'ENDING'].includes(snapshot.status);
    const prepared = snapshot.question?.audioId && !snapshot.question.answer ? snapshot.question : null;
    const job = finished || settled || prepared ? null : await this.jobs.get(currentJob(snapshot));
    const failed = job?.state === 'failed' || (answer?.processingStatus === 'FAILED' && !job);
    const pending = answer?.processingStatus === 'PENDING' || answer?.processingStatus === 'PROCESSING' || job?.state === 'active' || job?.state === 'waiting';
    const retryAfterAt = job?.retryAfterAt ?? null;
    const retryAvailable = !finished && snapshot.status !== 'ENDING' && failed && (!job || canRetryJob(job, this.settings.maximumExecutions, this.now()));
    const canRecord = snapshot.status === 'IN_PROGRESS' && Boolean(prepared) && !pending && !failed;
    return {
      evaluationId, topicCode: snapshot.topicCode, startingBandCode: snapshot.startingBandCode, status: snapshot.status,
      phase: finished ? 'FINISHED' : failed ? 'FAILED' : pending ? job?.phase ?? 'TRANSCRIBING' : prepared ? 'READY_TO_ANSWER' : 'IDLE',
      createdAt: snapshot.createdAt.toISOString(), startedAt: snapshot.startedAt?.toISOString() ?? null,
      pausedAt: snapshot.pausedAt?.toISOString() ?? null, endedAt: snapshot.endedAt?.toISOString() ?? null, endReason: snapshot.endReason,
      expiresAt: snapshot.startedAt ? new Date(Math.min(snapshot.startedAt.getTime() + this.settings.maximumDurationSeconds * 1000,
        snapshot.pausedAt ? snapshot.pausedAt.getTime() + this.settings.resumeWindowSeconds * 1000 : Infinity)).toISOString() : null,
      question: prepared?.audioId ? { questionId: prepared.questionId, questionNo: prepared.questionNo, content: prepared.content, difficultyLevelCode: prepared.difficultyLevelCode, audioId: prepared.audioId } : null,
      latestAnswer: answer ? { answerId: answer.answerId, questionId: answer.questionId, processingStatus: answer.processingStatus } : null,
      errorCode: failed ? job?.errorCode ?? 'PROCESSING_FAILED' : null, retryAvailable, retryAfterAt,
      actions: { canRecord, canSubmit: canRecord || (snapshot.status === 'IN_PROGRESS' && failed && job?.errorCode === 'UNRECOGNIZABLE_AUDIO' && !answer?.transcript),
        canPause: snapshot.status === 'IN_PROGRESS', canResume: snapshot.status === 'PAUSED' && !pending,
        canEnd: snapshot.status === 'IN_PROGRESS' || snapshot.status === 'PAUSED' },
    };
  }
  async retry(userId: string, evaluationId: string) {
    const snapshot = await this.owned(userId, evaluationId);
    const progress = await this.get(userId, evaluationId);
    if (!progress.retryAvailable) throw new EvaluationError('CONFLICT', '현재 작업을 재시도할 수 없습니다.');
    const input = currentJob(snapshot);
    const job = await this.jobs.get(input);
    if (job) await this.jobs.retry(input); else await this.jobs.enqueue(input);
    return this.get(userId, evaluationId);
  }
  async submitAnswer(userId: string, input: SubmitAnswer) {
    const snapshot = await this.owned(userId, input.evaluationId);
    const progress = await this.get(userId, input.evaluationId);
    const existing = snapshot.questions.find((q) => q.questionId === input.questionId)?.answer;
    const replace = existing?.processingStatus === 'FAILED' && !existing.transcript && progress.errorCode === 'UNRECOGNIZABLE_AUDIO';
    if (existing && !replace) return progress;
    if (!progress.actions.canSubmit || snapshot.question?.questionId !== input.questionId) throw new EvaluationError('CONFLICT', '현재 질문에만 답변할 수 있습니다.');
    if (!input.bytes.byteLength || input.bytes.byteLength > this.settings.maximumAnswerBytes) throw new EvaluationError('BAD_REQUEST', '음성 파일은 10 MiB 이하이어야 합니다.');
    const metadata = await this.inspector.inspectAnswer(input.bytes, input.mimeType);
    const answerId = existing?.answerId ?? this.newId();
    const audioId = this.newId();
    const audio = { ...metadata, audioId, objectKey: `answers/${answerId}/${audioId}.${metadata.extension}` };
    await this.storage.save(audio.objectKey, input.bytes, metadata.mimeType);
    let accepted = false;
    try {
      const result = await this.repository.acceptAnswer(userId, input, answerId, audio, this.now(), replace);
      accepted = result.accepted;
      if (!accepted) return this.get(userId, input.evaluationId);
      if (result.oldAudio) await this.storage.remove(result.oldAudio.objectKey).catch(() => undefined);
      const job: TurnJob = { kind: 'ANSWER', evaluationId: input.evaluationId, answerId: result.answer.answerId, audioId };
      try { await this.jobs.enqueue(job); }
      catch (error) { await this.repository.failAnswer(job); throw error; }
    } finally { if (!accepted) await this.storage.remove(audio.objectKey); }
    return this.get(userId, input.evaluationId);
  }
  async pause(userId: string, evaluationId: string) {
    await this.owned(userId, evaluationId);
    await this.repository.pause(evaluationId, this.now());
    const snapshot = await this.owned(userId, evaluationId);
    if (snapshot.pausedAt) await this.jobs.schedule({ kind: 'PAUSE_EXPIRY', evaluationId, at: snapshot.pausedAt.toISOString() }, new Date(snapshot.pausedAt.getTime() + this.settings.resumeWindowSeconds * 1000));
    return this.get(userId, evaluationId);
  }
  async resume(userId: string, evaluationId: string) {
    const progress = await this.get(userId, evaluationId);
    if (!progress.actions.canResume) throw new EvaluationError('CONFLICT', '작업이 끝나면 재개할 수 있습니다.');
    await this.repository.resume(evaluationId, this.now());
    return this.get(userId, evaluationId);
  }
  async end(userId: string, evaluationId: string) {
    const snapshot = await this.owned(userId, evaluationId);
    if (snapshot.status === 'READY') throw new EvaluationError('CONFLICT', '첫 질문이 준비된 후 종료할 수 있습니다.');
    await this.repository.end(evaluationId, 'USER_ENDED', this.now());
    await this.reports.ensureScheduled(evaluationId);
    return this.get(userId, evaluationId);
  }
  async resumable(userId: string) {
    await this.accounts.checkActive(userId);
    const result = await Promise.all((await this.repository.resumable(userId)).map((id) => this.get(userId, id)));
    return result.filter((p) => p.status === 'PAUSED');
  }
  async audio(userId: string, audioId: string) {
    await this.accounts.checkActive(userId);
    const audio = await this.repository.findQuestionAudio(userId, audioId);
    if (!audio) throw new EvaluationError('NOT_FOUND', '음성을 찾을 수 없습니다.');
    return { mimeType: audio.mimeType, bytes: await this.storage.read(audio.objectKey) };
  }
}
