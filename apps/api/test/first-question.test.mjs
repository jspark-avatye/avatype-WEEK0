import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const compiled = (path) => require(join(process.env.EVALUATION_UNIT_OUTPUT, path));
const { EvaluationApplicationService } = compiled('application/evaluation.service.js');
const { ConversationApplicationService } = compiled('application/conversation.service.js');
const { EvaluationSession, validateQuestion, validateNextDifficulty } = compiled('domain/evaluation-session.js');
const { EvaluationError, ProcessingError, processingFailure } = compiled('domain/evaluation-error.js');
const { readJobProgress, canRetryJob } = compiled('application/job-policy.js');
const { classifyProviderFailure } = compiled('domain/ai-failure.js');
const initial = new Date('2026-10-13T12:00:00Z');
const createInput = { evaluationId: 'evaluation', topicCode: 'TRAVEL', startingBandCode: 'BEGINNER' };
function fixture() {
  let clock = new Date(initial); let inactive = false; let sequence = 0;
  const state = { ...createInput, userId: 'owner', status: 'READY', createdAt: initial, startedAt: null, pausedAt: null, endedAt: null, endReason: null, questions: [] };
  const calls = { llm: 0, next: 0, stt: 0, tts: 0, remove: 0, retry: 0, enqueue: 0 };
  const failures = {}; const stored = new Map(); const registered = new Map(); const scheduled = [];
  const hooks = {}; let decision = { action: 'ASK', questionContent: 'Why would you like to visit that place?', difficultyLevelCode: 'BEGINNER_HIGH' };
  const project = () => structuredClone({ ...state, question: state.questions.at(-1) ?? null, latestAnswer: state.questions.flatMap((q) => q.answer ? [q.answer] : []).at(-1) ?? null });
  const findAnswer = (input) => state.questions.find((q) => q.answer?.answerId === input.answerId && q.answer.audio.audioId === input.audioId)?.answer;
  const finish = () => { if (state.status === 'ENDING' && !state.questions.some((q) => ['PENDING', 'PROCESSING'].includes(q.answer?.processingStatus))) state.status = 'ANALYSIS_PENDING'; };
  const accounts = { async checkActive() { if (inactive) throw new EvaluationError('UNAUTHORIZED', 'private'); } };
  const repository = {
    async create() { return project(); }, async find() { return project(); }, async resumable() { return state.status === 'PAUSED' ? ['evaluation'] : []; },
    async saveQuestion(id, content, difficultyLevelCode, input) {
      if (input && (!findAnswer(input) || !['IN_PROGRESS', 'PAUSED'].includes(state.status))) return null;
      const no = input ? state.questions.find((q) => q.answer?.answerId === input.answerId).questionNo + 1 : 1;
      let q = state.questions.find((q) => q.questionNo === no);
      if (!q) { q = { questionId: `q${no}`, questionNo: no, content, difficultyLevelCode, audioId: null, answer: null }; state.questions.push(q); }
      return structuredClone(q);
    },
    async completeQuestion(id, questionId, audio, now, input) {
      if (failures.commit) throw new Error('commit failed');
      if (failures.duplicate || (input && (!findAnswer(input) || !['IN_PROGRESS', 'PAUSED'].includes(state.status)))) return false;
      state.questions.find((q) => q.questionId === questionId).audioId = audio.audioId;
      if (!input) { state.startedAt = now; state.status = 'IN_PROGRESS'; }
      else { findAnswer(input).processingStatus = 'COMPLETED'; }
      return true;
    },
    async acceptAnswer(userId, input, answerId, audio, now, replace) {
      const q = state.questions.at(-1);
      if (state.status !== 'IN_PROGRESS') throw new EvaluationError('CONFLICT', 'not accepting');
      if (q.answer && !replace) return { accepted: false, answer: q.answer, oldAudio: null };
      const oldAudio = q.answer?.audio ?? null;
      q.answer = { answerId, questionId: q.questionId, audio, transcript: null, processingStatus: 'PENDING', acceptedAt: now };
      return { accepted: true, answer: q.answer, oldAudio };
    },
    async beginAnswer(input) { const a = findAnswer(input); if (!a || a.processingStatus === 'COMPLETED') return false; a.processingStatus = 'PROCESSING'; return true; },
    async saveTranscript(input, text) { const a = findAnswer(input); if (!a) return false; a.transcript ??= text; return true; },
    async completeAnswer(input) { const a = findAnswer(input); if (a?.transcript) a.processingStatus = 'COMPLETED'; finish(); },
    async failAnswer(input) { const a = findAnswer(input); if (a && a.processingStatus !== 'COMPLETED') a.processingStatus = 'FAILED'; finish(); },
    async pause(id, now) { state.status = 'PAUSED'; state.pausedAt = now; },
    async resume() { state.status = 'IN_PROGRESS'; state.pausedAt = null; },
    async end(id, reason, now) { if (!['IN_PROGRESS', 'PAUSED'].includes(state.status)) return; state.status = 'ENDING'; state.endedAt = now; state.endReason = reason; state.pausedAt = null; finish(); },
    async findQuestionAudio(userId, audioId) { return userId === 'owner' && state.questions.at(-1)?.audioId === audioId ? { audioId, objectKey: 'audio', mimeType: 'audio/mpeg', byteSize: 3, durationMs: 1000 } : null; },
  };
  const storage = { async save(key, bytes) { stored.set(key, bytes); }, async read() { return new Uint8Array([1, 2, 3]); }, async remove(key) { calls.remove++; stored.delete(key); } };
  const ai = {
    async generateQuestion() { calls.llm++; if (failures.llm) throw failures.llm; return 'Where would you like to travel?'; },
    async transcribe() { calls.stt++; await hooks.stt?.(); if (failures.stt) throw failures.stt; return 'I would like to visit London with my family.'; },
    async decideNextTurn(input) { calls.next++; assert.ok(input.history.every((turn) => turn.transcript)); await hooks.next?.(); if (failures.next) throw failures.next; return decision; },
    async synthesize() { calls.tts++; await hooks.tts?.(); if (failures.tts) throw failures.tts; return new Uint8Array([1, 2, 3]); },
  };
  const inspector = { async inspectMp3() { return { byteSize: 3, durationMs: 1000 }; }, async inspectAnswer() { return { byteSize: 3, durationMs: 3000, mimeType: 'audio/webm', extension: 'webm' }; } };
  const key = (input) => input.kind === 'START' ? 'start' : `${input.answerId}-${input.audioId}`;
  const jobs = {
    async get(input) { return registered.get(key(input)) ?? null; },
    async enqueue(input) { calls.enqueue++; if (failures.queue) throw new EvaluationError('INTERNAL_SERVER_ERROR', 'queue'); registered.set(key(input), { state: 'waiting', phase: input.kind === 'START' ? 'GENERATING_QUESTION' : 'TRANSCRIBING', failures: 0, errorCode: null, retryable: false, retryAfterAt: null }); },
    async retry(input) { calls.retry++; registered.get(key(input)).state = 'waiting'; },
    async schedule(input) { scheduled.push(input); },
  };
  const settings = { maximumExecutions: 3, maximumAnswerBytes: 10 * 1024 * 1024, maximumDurationSeconds: 600, resumeWindowSeconds: 300,
    options: () => ({ topics: [{ code: 'TRAVEL', label: '여행', description: '' }], startingBands: [{ code: 'BEGINNER', label: '초급' }], maximumDurationSeconds: 600 }), topicContext: () => 'Travel' };
  const id = () => `id${++sequence}`;
  const reports = { async ensureScheduled(evaluationId) { if (state.status === 'ANALYSIS_PENDING') { assert.equal(evaluationId, 'evaluation'); calls.report = (calls.report ?? 0) + 1; } } };
  const service = new EvaluationApplicationService(accounts, repository, storage, jobs, settings, inspector, id, () => clock, reports);
  const conversation = new ConversationApplicationService(accounts, repository, ai, storage, inspector, settings, id, () => clock, jobs, reports);
  async function run(input) {
    try { await conversation.process(input, async () => {}); registered.set(key(input), { state: 'completed', failures: 0 }); }
    catch (error) { const failure = processingFailure(error); const old = registered.get(key(input)); registered.set(key(input), { state: 'failed', phase: 'TRANSCRIBING', failures: (old?.failures ?? 0) + 1, errorCode: failure.publicCode, retryable: failure.retryable, retryAfterAt: failure.retryAfterAt }); throw error; }
  }
  return { state, calls, failures, hooks, stored, jobs, service, conversation, scheduled, registered, project, run,
    async start() { await run({ kind: 'START', evaluationId: 'evaluation' }); },
    async submit() { const q = state.questions.at(-1); await service.submitAnswer('owner', { evaluationId: 'evaluation', questionId: q.questionId, bytes: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm' }); const a = q.answer; return { kind: 'ANSWER', evaluationId: 'evaluation', answerId: a.answerId, audioId: a.audio.audioId }; },
    set inactive(v) { inactive = v; }, set clock(v) { clock = v; }, set decision(v) { decision = v; },
  };
}
test('first question commits audio/start atomically; repeated start does not call AI', async () => {
  const f = fixture(); assert.equal((await f.service.get('owner', 'evaluation')).question, null);
  await f.start(); const p = await f.service.get('owner', 'evaluation');
  assert.equal(p.phase, 'READY_TO_ANSWER'); assert.equal(p.question.questionNo, 1); assert.equal(p.startedAt, initial.toISOString());
  await f.start(); assert.equal(f.calls.llm, 1); assert.equal(f.calls.tts, 1); assert.ok(f.scheduled.some((j) => j.kind === 'SESSION_EXPIRY'));
});
test('first TTS retry preserves generated question', async () => { const f = fixture(); f.failures.tts = new ProcessingError('AI_TIMEOUT', true); await assert.rejects(f.start); f.failures.tts = null; await f.start(); assert.equal(f.calls.llm, 1); assert.equal(f.calls.tts, 2); });
test('failed DB commit and duplicate audio commit remove only unused new object', async () => {
  for (const mode of ['commit', 'duplicate']) { const f = fixture(); f.failures[mode] = true; if (mode === 'commit') await assert.rejects(f.start); else await f.start(); assert.equal(f.calls.remove, 1); assert.equal(f.stored.size, 0); assert.equal(f.state.startedAt, null); }
});
test('creation is idempotent and rejects changed settings and other owner', async () => { const f = fixture(); await f.service.create('owner', createInput); await assert.rejects(() => f.service.create('other', createInput), { code: 'NOT_FOUND' }); f.state.startingBandCode = 'ADVANCED'; await assert.rejects(() => f.service.create('owner', createInput), { code: 'CONFLICT' }); });
test('ownership/active checks precede external access', async () => { const f = fixture(); await assert.rejects(() => f.service.start('other', 'evaluation'), { code: 'NOT_FOUND' }); await assert.rejects(() => f.service.audio('other', 'audio'), { code: 'NOT_FOUND' }); f.inactive = true; await assert.rejects(f.start, { code: 'UNAUTHORIZED' }); assert.equal(f.calls.llm, 0); });
test('raw audio -> STT -> next question -> TTS, duplicate submission/execution are idempotent', async () => {
  const f = fixture(); await f.start(); const input = await f.submit(); await f.submit(); await f.run(input); await f.run(input);
  assert.equal(f.state.questions.length, 2); assert.equal(f.calls.stt, 1); assert.equal(f.calls.next, 1); assert.equal(f.calls.tts, 2);
  assert.equal(f.state.questions[0].answer.transcript, 'I would like to visit London with my family.'); assert.equal((await f.service.get('owner', 'evaluation')).question.questionNo, 2);
});
test('next LLM failure retries without STT; TTS failure retries without STT or LLM', async () => {
  const f = fixture(); await f.start(); const input = await f.submit(); f.failures.next = new ProcessingError('AI_UNAVAILABLE', true); await assert.rejects(() => f.run(input));
  f.failures.next = null; f.failures.tts = new ProcessingError('AI_TIMEOUT', true); await assert.rejects(() => f.run(input));
  f.failures.tts = null; await f.run(input); assert.equal(f.calls.stt, 1); assert.equal(f.calls.next, 2); assert.equal(f.calls.tts, 3);
});
test('queue registration failure retains input and retry does not reupload', async () => { const f = fixture(); await f.start(); f.failures.queue = true; await assert.rejects(f.submit); const before = f.stored.size; f.failures.queue = false; await f.service.retry('owner', 'evaluation'); assert.equal(f.stored.size, before); assert.equal(f.calls.enqueue, 2); });
test('failed answer is shown as processing after manual retry is queued', async () => { const f = fixture(); await f.start(); const input = await f.submit(); f.failures.stt = new ProcessingError('AI_TIMEOUT', true); await assert.rejects(() => f.run(input)); await f.service.retry('owner', 'evaluation'); assert.equal((await f.service.get('owner', 'evaluation')).phase, 'TRANSCRIBING'); });
test('retry budget and provider Retry-After are enforced; active job cannot retry', async () => {
  const f = fixture(); const input = { kind: 'START', evaluationId: 'evaluation' };
  for (const job of [{ state: 'failed', failures: 3, retryable: true }, { state: 'active', failures: 1, retryable: true }, { state: 'failed', failures: 1, retryable: false }, { state: 'failed', failures: 1, retryable: true, retryAfterAt: new Date(initial.getTime() + 60000).toISOString() }]) { f.registered.set('start', { phase: 'GENERATING_QUESTION', ...job }); await assert.rejects(() => f.service.retry('owner', 'evaluation'), { code: 'CONFLICT' }); }
  await f.jobs.enqueue(input); f.registered.set('start', { state: 'failed', failures: 1, retryable: true, phase: 'GENERATING_QUESTION', errorCode: 'AI_AUTH_FAILED' }); await f.service.retry('owner', 'evaluation'); assert.equal(f.calls.retry, 1);
});
test('pause during accepted STT finishes turn but keeps PAUSED; only settled work resumes', async () => { const f = fixture(); await f.start(); const input = await f.submit(); f.hooks.stt = async () => { await f.service.pause('owner', 'evaluation'); await assert.rejects(() => f.service.resume('owner', 'evaluation'), { code: 'CONFLICT' }); }; await f.run(input); assert.equal(f.state.status, 'PAUSED'); assert.equal(f.state.questions[1].audioId !== null, true); assert.equal((await f.service.get('owner', 'evaluation')).actions.canRecord, false); await f.service.resume('owner', 'evaluation'); assert.equal(f.state.status, 'IN_PROGRESS'); });
test('end during STT saves transcript only and reaches ANALYSIS_PENDING', async () => { const f = fixture(); await f.start(); const input = await f.submit(); f.hooks.stt = () => f.service.end('owner', 'evaluation'); await f.run(input); assert.equal(f.state.status, 'ANALYSIS_PENDING'); assert.equal(f.calls.next, 0); assert.equal(f.calls.tts, 1); assert.equal(f.state.endReason, 'USER_ENDED'); });
test('end during LLM publishes no next question/TTS', async () => { const f = fixture(); await f.start(); const input = await f.submit(); f.hooks.next = () => f.service.end('owner', 'evaluation'); await f.run(input); assert.equal(f.state.status, 'ANALYSIS_PENDING'); assert.equal(f.state.questions.length, 1); assert.equal(f.calls.tts, 1); });
test('end during TTS publishes no audio and preserves accepted transcript', async () => { const f = fixture(); await f.start(); const input = await f.submit(); f.hooks.tts = () => f.service.end('owner', 'evaluation'); await f.run(input); assert.equal(f.state.status, 'ANALYSIS_PENDING'); assert.equal(f.state.questions[1].audioId, null); assert.ok(f.state.questions[0].answer.transcript); });
test('unrecognizable answer can be replaced, old input job cannot overwrite it', async () => { const f = fixture(); await f.start(); const old = await f.submit(); f.failures.stt = new ProcessingError('UNRECOGNIZABLE_AUDIO', false); await assert.rejects(() => f.run(old)); assert.equal((await f.service.get('owner', 'evaluation')).actions.canSubmit, true); f.failures.stt = null; const fresh = await f.submit(); assert.equal(old.answerId, fresh.answerId); assert.notEqual(old.audioId, fresh.audioId); await f.run(old); assert.equal(f.state.questions[0].answer.processingStatus, 'PENDING'); await f.run(fresh); assert.equal(f.state.questions.length, 2); assert.equal(f.calls.remove, 1); });
test('600 second limit includes pauses; old pause expiry after re-pause is harmless', async () => { const f = fixture(); await f.start(); await f.service.pause('owner', 'evaluation'); const oldAt = f.state.pausedAt.toISOString(); await f.service.resume('owner', 'evaluation'); f.clock = new Date(initial.getTime() + 200000); await f.service.pause('owner', 'evaluation'); f.clock = new Date(initial.getTime() + 310000); await f.conversation.process({ kind: 'PAUSE_EXPIRY', evaluationId: 'evaluation', at: oldAt }, async () => {}); assert.equal(f.state.status, 'PAUSED'); f.clock = new Date(initial.getTime() + 600000); await f.service.get('owner', 'evaluation'); assert.equal(f.state.endReason, 'TIME_LIMIT'); });
test('pause window expiry makes session non-resumable', async () => { const f = fixture(); await f.start(); await f.service.pause('owner', 'evaluation'); f.clock = new Date(initial.getTime() + 300000); await assert.rejects(() => f.service.resume('owner', 'evaluation'), { code: 'CONFLICT' }); assert.equal(f.state.endReason, 'PAUSE_EXPIRED'); });
test('END decision before five answers and difficulty jumps are rejected', async () => { const f = fixture(); await f.start(); const input = await f.submit(); f.decision = { action: 'END', questionContent: null, difficultyLevelCode: null }; await assert.rejects(() => f.run(input), { publicCode: 'AI_INVALID_OUTPUT' }); assert.throws(() => validateNextDifficulty('BEGINNER_MID', 'ADVANCED_HIGH'), ProcessingError); });
test('END with five answers reaches report boundary and never generates TTS', async () => { const f = fixture(); await f.start(); for (let i = 0; i < 5; i++) { f.decision = i === 4 ? { action: 'END', questionContent: null, difficultyLevelCode: null } : { action: 'ASK', questionContent: 'What else would you enjoy doing there?', difficultyLevelCode: 'BEGINNER_MID' }; await f.run(await f.submit()); } assert.equal(f.state.status, 'ANALYSIS_PENDING'); assert.equal(f.state.endReason, 'SUFFICIENT_EVIDENCE'); assert.equal(f.calls.tts, 5); });
test('domain accepts started sessions while successor audio is pending', () => { const f = fixture(); f.state.startedAt = initial; f.state.status = 'IN_PROGRESS'; assert.equal(EvaluationSession.restore(f.project()).initialDifficulty, 'BEGINNER_MID'); for (const s of ['', 'Hi.', 'Why? What?', '안녕?', 'a'.repeat(501) + '?']) assert.throws(() => validateQuestion(s), ProcessingError); assert.equal(processingFailure(new Error('secret')).message, 'PROCESSING_FAILED'); });
test('provider failures distinguish auth, permission, model, quota, request, throttling, timeout and server failures', () => {
  for (const [input, code] of [[{ status: 401 }, 'AI_AUTH_FAILED'], [{ status: 403 }, 'AI_ACCESS_DENIED'], [{ status: 404 }, 'AI_MODEL_UNAVAILABLE'], [{ status: 429, code: 'insufficient_quota' }, 'AI_QUOTA_EXCEEDED'], [{ status: 400 }, 'AI_INVALID_REQUEST'], [{ status: 429 }, 'AI_RATE_LIMITED'], [{ timeout: true }, 'AI_TIMEOUT'], [{ status: 503 }, 'AI_UNAVAILABLE']]) assert.equal(classifyProviderFailure(input).publicCode, code);
  assert.equal(classifyProviderFailure({ status: 429, retryAfter: '30' }, initial.getTime()).retryAfterAt, new Date(initial.getTime() + 30000).toISOString());
});

test('legacy AI_CONFIGURATION job becomes retryable without resetting its cumulative budget', () => {
  const progress = readJobProgress({ phase: 'SYNTHESIZING', errorCode: 'AI_CONFIGURATION', retryable: false });
  assert.equal(progress.retryable, true);
  assert.equal(canRetryJob({ ...progress, state: 'failed', failures: 2 }, 3, initial), true);
  assert.equal(canRetryJob({ ...progress, state: 'failed', failures: 3 }, 3, initial), false);
  assert.equal(readJobProgress({ errorCode: 'AI_REFUSAL', retryable: false }).retryable, false);
});
test('domain encapsulates the restored snapshot instead of sharing mutable caller state', () => { const f = fixture(); const input = f.project(); const session = EvaluationSession.restore(input); input.startingBandCode = 'ADVANCED'; assert.equal(session.initialDifficulty, 'BEGINNER_MID'); });
test('domain blocks resume with pending work and rejects expired answer acceptance', async () => {
  const f = fixture(); await f.start(); await f.submit(); await f.service.pause('owner', 'evaluation');
  assert.throws(() => EvaluationSession.restore(f.project()).assertCanResume(initial, 600, 300), { code: 'CONFLICT' });
  f.state.questions[0].answer.processingStatus = 'FAILED'; EvaluationSession.restore(f.project()).assertCanResume(initial, 600, 300);
  f.state.status = 'IN_PROGRESS'; f.state.pausedAt = null;
  assert.throws(() => EvaluationSession.restore(f.project()).assertCanAcceptAnswer('owner', 'q1', new Date(initial.getTime() + 600000), 600, 300), { code: 'CONFLICT' });
});

test('report dispatch follows user/time/AI endings and the last accepted answer settling', async () => {
  const user = fixture(); await user.start(); await user.service.end('owner', 'evaluation'); assert.ok(user.calls.report > 0);
  const timed = fixture(); await timed.start(); timed.clock = new Date(initial.getTime() + 600001); await timed.service.get('owner', 'evaluation'); assert.ok(timed.calls.report > 0);
  const expiry = fixture(); await expiry.start(); expiry.clock = new Date(initial.getTime() + 600001); await expiry.run({ kind: 'SESSION_EXPIRY', evaluationId: 'evaluation', at: initial.toISOString() }); assert.ok(expiry.calls.report > 0);
  const pending = fixture(); await pending.start(); const input = await pending.submit(); await pending.service.end('owner', 'evaluation'); assert.equal(pending.calls.report ?? 0, 0); await pending.run(input); assert.ok(pending.calls.report > 0);
  const failed = fixture(); await failed.start(); const accepted = await failed.submit(); await failed.service.end('owner', 'evaluation'); failed.failures.stt = new ProcessingError('AI_UNAVAILABLE', true); await assert.rejects(() => failed.run(accepted)); assert.ok(failed.calls.report > 0);
  const ai = fixture(); await ai.start(); for (let i = 0; i < 4; i++) await ai.run(await ai.submit()); ai.decision = { action: 'END', questionContent: null, difficultyLevelCode: null }; await ai.run(await ai.submit()); assert.ok(ai.calls.report > 0);
});
