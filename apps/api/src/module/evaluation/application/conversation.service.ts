import type { ConversationJob, JobPhase, SessionSnapshot, TurnJob } from './evaluation.contracts';
import type { ActiveAccounts, AudioInspector, AudioStorage, ConversationAI, ConversationJobs, ConversationUseCase, EvaluationRepository, EvaluationSettings, ReportDispatch } from './evaluation.ports';
import { EvaluationSession, expiry, validateNextDifficulty, validateQuestion } from '../domain/evaluation-session';
import { EvaluationError, ProcessingError } from '../domain/evaluation-error';

type AnswerInput = Extract<TurnJob, { kind: 'ANSWER' }>;
export class ConversationApplicationService implements ConversationUseCase {
  constructor(
    private readonly accounts: ActiveAccounts, private readonly repository: EvaluationRepository,
    private readonly ai: ConversationAI, private readonly storage: AudioStorage,
    private readonly inspector: AudioInspector, private readonly settings: EvaluationSettings,
    private readonly newId: () => string, private readonly now: () => Date, private readonly jobs: ConversationJobs,
    private readonly reports: ReportDispatch,
  ) {}
  private async load(evaluationId: string): Promise<SessionSnapshot> {
    const snapshot = await this.repository.find(evaluationId);
    if (!snapshot) throw new EvaluationError('NOT_FOUND', '평가를 찾을 수 없습니다.');
    await this.accounts.checkActive(snapshot.userId);
    const reason = expiry(snapshot, this.now(), this.settings.maximumDurationSeconds, this.settings.resumeWindowSeconds);
    if (reason && ['IN_PROGRESS', 'PAUSED'].includes(snapshot.status)) {
      await this.repository.end(evaluationId, reason, this.now());
      return (await this.repository.find(evaluationId))!;
    }
    return snapshot;
  }
  async process(input: ConversationJob, progress: (phase: JobPhase) => Promise<void>) {
    try { await this.processConversation(input, progress); }
    finally { await this.reports.ensureScheduled(input.evaluationId); }
  }
  private async processConversation(input: ConversationJob, progress: (phase: JobPhase) => Promise<void>) {
    if (input.kind === 'SESSION_EXPIRY' || input.kind === 'PAUSE_EXPIRY') {
      const snapshot = await this.repository.find(input.evaluationId);
      if (!snapshot) return;
      if (input.kind === 'PAUSE_EXPIRY' && snapshot.pausedAt?.toISOString() !== input.at) return;
      await this.load(input.evaluationId); return;
    }
    if (input.kind === 'START') return this.firstQuestion(input.evaluationId, progress);
    try { await this.answer(input, progress); }
    catch (error) { await this.repository.failAnswer(input); throw error; }
  }
  async firstQuestion(evaluationId: string, progress: (phase: JobPhase) => Promise<void>) {
    const snapshot = await this.load(evaluationId);
    if (snapshot.status !== 'READY') return;
    const session = EvaluationSession.restore(snapshot);
    let question = snapshot.question;
    if (!question) {
      await progress('GENERATING_QUESTION');
      const content = validateQuestion(await this.ai.generateQuestion({ topic: this.settings.topicContext(snapshot.topicCode), startingBand: snapshot.startingBandCode, difficulty: session.initialDifficulty }));
      await this.accounts.checkActive(snapshot.userId);
      question = await this.repository.saveQuestion(evaluationId, content, session.initialDifficulty);
    }
    if (!question) return;
    await this.questionAudio(evaluationId, question.questionId, question.content, progress);
    const ready = await this.load(evaluationId);
    if (ready.startedAt) await this.jobs.schedule({ kind: 'SESSION_EXPIRY', evaluationId, at: ready.startedAt.toISOString() }, new Date(ready.startedAt.getTime() + this.settings.maximumDurationSeconds * 1000));
  }
  private async answer(input: AnswerInput, progress: (phase: JobPhase) => Promise<void>) {
    if (!await this.repository.beginAnswer(input)) return;
    let snapshot = await this.load(input.evaluationId);
    let source = snapshot.questions.find((q) => q.answer?.answerId === input.answerId && q.answer.audio.audioId === input.audioId);
    if (!source?.answer) return;
    if (!source.answer.transcript) {
      await progress('TRANSCRIBING');
      const text = (await this.ai.transcribe(await this.storage.read(source.answer.audio.objectKey), source.answer.audio.mimeType)).trim();
      if (!text || !/[a-zA-Z]/.test(text)) throw new ProcessingError('UNRECOGNIZABLE_AUDIO', false);
      await this.accounts.checkActive(snapshot.userId);
      if (!await this.repository.saveTranscript(input, text)) return;
    }
    snapshot = await this.load(input.evaluationId);
    if (snapshot.status === 'ENDING') { await this.repository.completeAnswer(input, this.now()); return; }
    if (!['IN_PROGRESS', 'PAUSED'].includes(snapshot.status)) return;
    source = snapshot.questions.find((q) => q.answer?.answerId === input.answerId && q.answer.audio.audioId === input.audioId);
    if (!source?.answer) return;
    let next = snapshot.questions.find((q) => q.questionNo === source.questionNo + 1);
    if (!next) {
      await progress('GENERATING_QUESTION');
      const history = snapshot.questions.flatMap((q) => q.answer?.transcript ? [{ question: q.content, difficulty: q.difficultyLevelCode, transcript: q.answer.transcript }] : []);
      const decision = await this.ai.decideNextTurn({ topic: this.settings.topicContext(snapshot.topicCode), history, elapsedSeconds: Math.floor((this.now().getTime() - snapshot.startedAt!.getTime()) / 1000) });
      snapshot = await this.load(input.evaluationId);
      if (snapshot.status === 'ENDING') { await this.repository.completeAnswer(input, this.now()); return; }
      if (decision.action === 'END') {
        if (history.length < 5) throw new ProcessingError('AI_INVALID_OUTPUT', true);
        await this.repository.end(input.evaluationId, 'SUFFICIENT_EVIDENCE', this.now());
        await this.repository.completeAnswer(input, this.now()); return;
      }
      validateNextDifficulty(source.difficultyLevelCode, decision.difficultyLevelCode);
      next = await this.repository.saveQuestion(input.evaluationId, validateQuestion(decision.questionContent), decision.difficultyLevelCode, input) ?? undefined;
    }
    if (!next) return;
    if (next.audioId) { await this.repository.completeAnswer(input, this.now()); return; }
    await this.questionAudio(input.evaluationId, next.questionId, next.content, progress, input);
    snapshot = await this.load(input.evaluationId);
    if (snapshot.status === 'ENDING') await this.repository.completeAnswer(input, this.now());
  }
  private async questionAudio(evaluationId: string, questionId: string, content: string, progress: (phase: JobPhase) => Promise<void>, input?: AnswerInput) {
    let snapshot = await this.load(evaluationId);
    if (input && !['IN_PROGRESS', 'PAUSED'].includes(snapshot.status)) return;
    await progress('SYNTHESIZING');
    const bytes = await this.ai.synthesize(content);
    const metadata = await this.inspector.inspectMp3(bytes);
    snapshot = await this.load(evaluationId);
    if (input && !['IN_PROGRESS', 'PAUSED'].includes(snapshot.status)) return;
    const audioId = this.newId(); const objectKey = `questions/${questionId}/${audioId}.mp3`;
    await this.storage.save(objectKey, bytes, 'audio/mpeg');
    let committed = false;
    try {
      await this.accounts.checkActive(snapshot.userId);
      committed = await this.repository.completeQuestion(evaluationId, questionId, { audioId, objectKey, mimeType: 'audio/mpeg', ...metadata }, this.now(), input);
    } finally { if (!committed) await this.storage.remove(objectKey); }
  }
}
