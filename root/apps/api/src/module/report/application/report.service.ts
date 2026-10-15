import type { AnalyzedTurn, HistoryInput, ReportProgress, ReportSource } from './report.contracts';
import type { ReportAccounts, ReportAI, ReportAnalysisUseCase, ReportAudio, ReportAudioPreparation, ReportJobs, ReportRepository, ReportUseCase } from './report.ports';
import { ReportError } from '../domain/report-error';
import { canRetry, eligibleAnswers, insufficientAssessment, validateAssessment } from '../domain/report-policy';
import { ProcessingError } from '../../../shared/processing-error';

export class ReportApplicationService implements ReportUseCase, ReportAnalysisUseCase {
  constructor(private readonly accounts: ReportAccounts, private readonly repository: ReportRepository,
    private readonly jobs: ReportJobs, private readonly audio: ReportAudio, private readonly preparation: ReportAudioPreparation,
    private readonly ai: ReportAI, private readonly now: () => Date) {}

  private async owned(userId: string, evaluationId: string): Promise<ReportSource> {
    await this.accounts.checkActive(userId);
    const source = await this.repository.source(evaluationId);
    if (!source || source.userId !== userId) throw new ReportError('NOT_FOUND', '평가를 찾을 수 없습니다.');
    return source;
  }
  async ensureScheduled(evaluationId: string) {
    const source = await this.repository.source(evaluationId);
    if (source?.status === 'ANALYSIS_PENDING' && !await this.repository.document(evaluationId)) await this.jobs.enqueue(evaluationId);
  }
  async analyze(userId: string, evaluationId: string) {
    const source = await this.owned(userId, evaluationId);
    if (!['ANALYSIS_PENDING', 'ANALYZING', 'ANALYSIS_FAILED', 'COMPLETED'].includes(source.status)) throw new ReportError('CONFLICT', '회화 종료 후 보고서를 분석할 수 있습니다.');
    await this.ensureScheduled(evaluationId);
    return this.get(userId, evaluationId);
  }
  async get(userId: string, evaluationId: string): Promise<ReportProgress> {
    const source = await this.owned(userId, evaluationId);
    const status = source.status;
    if (status !== 'ANALYSIS_PENDING' && status !== 'ANALYZING' && status !== 'ANALYSIS_FAILED' && status !== 'COMPLETED') throw new ReportError('CONFLICT', '회화를 종료한 뒤 보고서를 확인해 주세요.');
    if (status === 'COMPLETED') {
      const report = await this.repository.document(evaluationId);
      if (!report) throw new ProcessingError('REPORT_INCOMPLETE', false);
      return { evaluationId, status, stage: 'COMPLETED', report, errorCode: null, canStart: false, retryAvailable: false, retryAfterAt: null };
    }
    const job = await this.jobs.get(evaluationId);
    // The DB is marked failed before BullMQ finishes publishing error metadata.
    // Keep polling that short transition rather than hiding a retryable error.
    const publicStatus = status === 'ANALYSIS_FAILED' && job && (job.state === 'active' || job.state === 'waiting') ? 'ANALYZING' : status;
    const failed = publicStatus === 'ANALYSIS_FAILED';
    return { evaluationId, status: publicStatus, report: null,
      stage: failed ? 'FAILED' : job?.state === 'active' ? job.stage : job ? 'QUEUED' : 'NOT_STARTED',
      errorCode: failed ? job?.errorCode ?? 'REPORT_JOB_MISSING' : null,
      canStart: status === 'ANALYSIS_PENDING' && !job,
      retryAvailable: failed && Boolean(job && canRetry(job, this.now())), retryAfterAt: failed && job?.retryable && job.failures < 3 ? job.retryAfterAt : null,
    };
  }
  async retry(userId: string, evaluationId: string) {
    const state = await this.get(userId, evaluationId);
    if (!state.retryAvailable) throw new ReportError('CONFLICT', '현재 분석은 재시도할 수 없습니다.');
    if (!await this.repository.prepareRetry(evaluationId)) return this.get(userId, evaluationId);
    try { await this.jobs.retry(evaluationId); }
    catch (error) { await this.repository.restoreFailure(evaluationId); throw error; }
    return this.get(userId, evaluationId);
  }
  async history(userId: string, input: HistoryInput) {
    await this.accounts.checkActive(userId);
    if (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > 1000000 || !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 50) throw new ReportError('BAD_REQUEST', '페이지 정보를 확인해 주세요.');
    return this.repository.history(userId, input);
  }
  async answerAudio(userId: string, evaluationId: string, answerId: string) {
    await this.owned(userId, evaluationId);
    const file = await this.repository.evidenceAudio(userId, evaluationId, answerId);
    if (!file) throw new ReportError('NOT_FOUND', '보고서 근거 음성을 찾을 수 없습니다.');
    return { mimeType: file.mimeType, bytes: await this.audio.read(file.objectKey) };
  }
  async process(evaluationId: string, progress: (stage: ReportProgress['stage']) => Promise<void>) {
    try {
      if (!await this.repository.claim(evaluationId)) return;
      const source = await this.repository.source(evaluationId);
      if (!source) throw new ReportError('NOT_FOUND', '평가를 찾을 수 없습니다.');
      await this.accounts.checkActive(source.userId);
      if (source.answers.some((a) => a.processingStatus === 'PENDING' || a.processingStatus === 'PROCESSING')) throw new ReportError('CONFLICT', '답변 처리가 아직 끝나지 않았습니다.');
      const turns: AnalyzedTurn[] = []; const excluded: { answerId: string; reason: string }[] = [];
      for (const answer of source.answers) {
        if (!answer.transcript?.trim()) { excluded.push({ answerId: answer.answerId, reason: '평가에 사용할 전사문이 없습니다.' }); continue; }
        await progress('ANALYZING_AUDIO');
        const wav = await this.preparation.wav(await this.audio.read(answer.objectKey));
        const speech = await this.ai.observe({ answerId: answer.answerId, question: answer.question, transcript: answer.transcript, wav });
        if (speech.answerId !== answer.answerId) throw new ProcessingError('AI_INVALID_OUTPUT', true);
        turns.push({ ...answer, speech });
        if (!speech.transcriptUsable) excluded.push({ answerId: answer.answerId, reason: speech.exclusionReason ?? '음성과 전사문을 함께 평가하기 어렵습니다.' });
      }
      await progress('GENERATING_REPORT');
      const assessable = turns.some((t) => t.speech.transcriptUsable || t.speech.pronunciation.assessable || t.speech.fluency.assessable);
      const result = assessable
        ? validateAssessment(await this.ai.assess({ topicCode: source.topicCode, endReason: source.endReason, turns, excluded }), turns)
        : insufficientAssessment(source.answers.length === 0 ? '답변이 제출되지 않아 영어 회화 수준을 판단할 수 없습니다. 답변을 녹음하여 다시 평가해 주세요.'
          : '제출한 답변에서 평가에 사용할 전사문 또는 음성 근거를 확보하지 못했습니다. 답변 처리 실패와 인식 불확실 구간은 평가에서 제외했습니다.');
      await this.accounts.checkActive(source.userId);
      await progress('SAVING_REPORT');
      await this.repository.save(evaluationId, result, eligibleAnswers(turns));
    } catch (error) {
      await this.repository.fail(evaluationId);
      throw error;
    }
  }
}
