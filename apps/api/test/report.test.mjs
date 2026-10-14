import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const compiled = (path) => require(join(process.env.REPORT_UNIT_OUTPUT, path));
const { ReportApplicationService } = compiled('module/report/application/report.service.js');
const { parseAssessment, parseSpeech, validateAssessment, canRetry, eligibleAnswers } = compiled('module/report/domain/report-policy.js');
const { ProcessingError } = compiled('shared/processing-error.js');
const codes = ['VOCABULARY', 'GRAMMAR', 'PRONUNCIATION', 'FLUENCY', 'RELEVANCE'];
function observation(answerId, overrides = {}) { return { answerId, transcriptUsable: true, pronunciation: { assessable: true, observation: '발음이 명료합니다.' }, fluency: { assessable: true, observation: '일관되게 연결하여 설명합니다.' }, exclusionReason: null, ...overrides }; }
function assessment(ids) { return { finalLevelCode: 'ADVANCED_LOW', summary: '복잡한 주제에서도 자신의 의견을 설명합니다.', criteria: codes.map((criterionCode) => ({ criterionCode, score: 75, insufficientReason: null, rationale: '실제 답변으로 판단했습니다.', evidence: ids.slice(0, 3).map((answerId) => ({ answerId, explanation: '구체적인 이유를 전달한 답변입니다.' })), feedback: [{ feedbackKind: 'IMPROVEMENT', suggestion: '대안을 비교하는 표현을 연습해 보세요.', explanation: '설명의 범위를 넓히는 데 도움이 됩니다.' }] })) }; }
function fixture(count = 5) {
  let inactive = false; let clock = new Date('2026-10-14T00:00:00Z'); let stored = null;
  const source = { evaluationId: randomUUID(), userId: 'owner', status: 'ANALYSIS_PENDING', topicCode: 'WORK', endReason: 'USER_ENDED',
    answers: Array.from({ length: count }, (_, i) => ({ answerId: randomUUID(), questionId: randomUUID(), question: `Question ${i}`, transcript: `I enjoy working together and explaining alternatives ${i}.`, processingStatus: 'COMPLETED', objectKey: `answers/${i}`, mimeType: 'audio/webm', durationMs: 10000 })),
  };
  const calls = { audio: 0, observe: 0, assess: 0, save: 0, enqueue: 0, retry: 0 }; const flags = {}; const stages = []; let job = null;
  const repository = {
    async source() { return structuredClone(source); }, async document() { return stored; },
    async claim() { if (stored || !['ANALYSIS_PENDING', 'ANALYZING'].includes(source.status)) return false; source.status = 'ANALYZING'; return true; },
    async fail() { if (!stored) source.status = 'ANALYSIS_FAILED'; }, async restoreFailure() { if (source.status === 'ANALYSIS_PENDING') source.status = 'ANALYSIS_FAILED'; },
    async prepareRetry() { if (source.status !== 'ANALYSIS_FAILED') return false; source.status = 'ANALYSIS_PENDING'; return true; },
    async save(id, result, eligible) { if (flags.save) throw new Error('commit failed'); calls.save++; assert.equal(id, source.evaluationId); for (const c of result.criteria) assert.ok(c.evidence.every((e) => eligible[c.criterionCode].includes(e.answerId))); stored = { ...result, reportId: randomUUID(), evaluationId: id, createdAt: clock.toISOString() }; source.status = 'COMPLETED'; },
    async history(userId, input) { assert.equal(userId, 'owner'); return { ...input, total: 0, items: [] }; },
    async evidenceAudio(userId, evaluationId, answerId) { return stored && userId === 'owner' && evaluationId === source.evaluationId && stored.criteria.some((c) => c.evidence.some((e) => e.answerId === answerId)) ? { mimeType: 'audio/webm', objectKey: 'answers/0' } : null; },
  };
  const jobs = {
    async enqueue() { calls.enqueue++; if (flags.enqueue) throw new Error('queue unavailable'); if (!job) job = { state: 'waiting', failures: 0, stage: 'QUEUED', retryable: false, errorCode: null, retryAfterAt: null }; },
    async get() { return job ? structuredClone(job) : null; },
    async retry() { if (flags.retry) throw new Error('queue unavailable'); calls.retry++; job.state = 'waiting'; },
  };
  const accounts = { async checkActive() { if (inactive) { const error = new Error('inactive'); error.code = 'UNAUTHORIZED'; throw error; } } };
  const audio = { async read() { calls.audio++; return new Uint8Array([1, 2]); } };
  const preparation = { async wav(bytes) { assert.deepEqual(bytes, new Uint8Array([1, 2])); return bytes; } };
  const ai = {
    async observe(input) { calls.observe++; if (flags.observe) throw flags.observe; return observation(input.answerId, flags.speech ?? {}); },
    async assess(input) { calls.assess++; assert.equal(input.turns.length, source.answers.filter((a) => a.transcript?.trim()).length); return flags.result ?? assessment(input.turns.filter((a) => a.speech.transcriptUsable).map((a) => a.answerId)); },
  };
  const service = new ReportApplicationService(accounts, repository, jobs, audio, preparation, ai, () => clock);
  async function run() {
    await service.ensureScheduled(source.evaluationId); job.state = 'active';
    try { await service.process(source.evaluationId, async (stage) => { stages.push(stage); job.stage = stage; }); job.state = 'completed'; }
    catch (error) { job.state = 'failed'; job.failures++; job.errorCode = error instanceof ProcessingError ? error.publicCode : 'PROCESSING_FAILED'; job.retryable = !(error instanceof ProcessingError) || error.retryable; job.retryAfterAt = error instanceof ProcessingError ? error.retryAfterAt : null; throw error; }
  }
  return { service, source, calls, flags, stages, run, get stored() { return stored; }, get job() { return job; }, setInactive() { inactive = true; }, advance(ms) { clock = new Date(clock.getTime() + ms); } };
}
test('full audio observations -> report -> one atomic confirmed result, repeated jobs skip AI', async () => {
  const f = fixture(); await f.run(); assert.equal(f.stored.verdict, 'CONFIRMED'); assert.equal(f.stored.finalLevelCode, 'ADVANCED_LOW');
  assert.equal(f.calls.observe, 5); assert.equal(f.calls.assess, 1); assert.equal(f.calls.save, 1); assert.equal(f.stages.at(-1), 'SAVING_REPORT');
  await f.service.process(f.source.evaluationId, async () => {}); await f.service.analyze('owner', f.source.evaluationId); assert.equal(f.calls.assess, 1);
  assert.equal((await f.service.get('owner', f.source.evaluationId)).stage, 'COMPLETED');
});
test('short assessment is provisional, does not cap the AI-selected level to a starting band', async () => { const f = fixture(1); await f.run(); assert.equal(f.stored.verdict, 'PROVISIONAL'); assert.equal(f.stored.finalLevelCode, 'ADVANCED_LOW'); });
test('no transcript produces five insufficient criteria without storage/audio/LLM calls', async () => {
  const f = fixture(2); f.source.answers.forEach((a) => { a.transcript = null; a.processingStatus = 'FAILED'; }); await f.run();
  assert.equal(f.stored.verdict, 'UNASSESSABLE'); assert.equal(f.stored.finalLevelCode, null); assert.ok(f.stored.criteria.every((c) => c.score === null && c.insufficientReason)); assert.equal(f.calls.audio, 0); assert.equal(f.calls.assess, 0);
});
test('failed successor work does not discard a usable transcript/audio answer', async () => { const f = fixture(); f.source.answers[0].processingStatus = 'FAILED'; await f.run(); assert.equal(f.stored.verdict, 'CONFIRMED'); assert.equal(f.calls.observe, 5); });
test('a missing audio criterion stays null and makes the report provisional', async () => {
  const f = fixture(); const result = assessment(f.source.answers.map((a) => a.answerId)); Object.assign(result.criteria[2], { score: null, insufficientReason: '발음 근거 부족', evidence: [], feedback: [] }); f.flags.result = result; await f.run(); assert.equal(f.stored.verdict, 'PROVISIONAL'); assert.equal(f.stored.criteria[2].score, null);
});
test('invalid score/set/duplicate or foreign evidence is rejected before saving', async () => {
  for (const change of [
    (r) => { r.criteria[0].score = 101; }, (r) => { r.criteria[0].score = 10.5; }, (r) => { r.criteria.pop(); },
    (r) => { r.criteria[1].criterionCode = r.criteria[0].criterionCode; }, (r) => { r.criteria[0].evidence[0].answerId = randomUUID(); },
    (r) => { r.criteria[0].evidence.push(r.criteria[0].evidence[0]); }, (r) => { r.criteria[0].insufficientReason = 'both'; },
  ]) { const f = fixture(); f.flags.result = assessment(f.source.answers.map((a) => a.answerId)); change(f.flags.result); await assert.rejects(f.run, (e) => e.publicCode === 'AI_INVALID_OUTPUT'); assert.equal(f.stored, null); assert.equal(f.source.status, 'ANALYSIS_FAILED'); }
});
test('transcript mismatch cannot be cited by text criteria, and unavailable audio cannot be scored using text', () => {
  const answerId = randomUUID(); const turns = [{ answerId, speech: observation(answerId, { transcriptUsable: false, exclusionReason: '전사 불일치', pronunciation: { assessable: false, observation: '부족' } }) }];
  assert.deepEqual(eligibleAnswers(turns).VOCABULARY, []); assert.deepEqual(eligibleAnswers(turns).PRONUNCIATION, []);
  assert.throws(() => validateAssessment(assessment([answerId]), turns), (e) => e.publicCode === 'AI_INVALID_OUTPUT');
});
test('commit failure leaves no partial result; retry reprocesses the same immutable audio input', async () => {
  const f = fixture(); f.flags.save = true; await assert.rejects(f.run); assert.equal(f.stored, null); const original = structuredClone(f.source.answers);
  await f.service.retry('owner', f.source.evaluationId); assert.equal(f.job.failures, 1); delete f.flags.save; await f.run(); assert.deepEqual(f.source.answers, original); assert.equal(f.stored.verdict, 'CONFIRMED'); assert.equal(f.calls.observe, 10);
});
test('retry budget counts the original execution and prevents a fourth attempt', async () => {
  const f = fixture(); f.flags.observe = new ProcessingError('AI_TIMEOUT', true);
  for (let attempt = 1; attempt <= 3; attempt++) { await assert.rejects(f.run); assert.equal(f.job.failures, attempt); const state = await f.service.get('owner', f.source.evaluationId); assert.equal(state.retryAvailable, attempt < 3); if (attempt < 3) await f.service.retry('owner', f.source.evaluationId); }
  await assert.rejects(() => f.service.retry('owner', f.source.evaluationId), (e) => e.code === 'CONFLICT'); assert.equal(f.calls.retry, 2);
});
test('Retry-After and nonretryable refusal are respected', async () => {
  const f = fixture(); f.flags.observe = new ProcessingError('AI_RATE_LIMITED', true, '2026-10-14T00:00:10Z'); await assert.rejects(f.run);
  assert.equal((await f.service.get('owner', f.source.evaluationId)).retryAvailable, false); f.advance(11000); assert.equal((await f.service.get('owner', f.source.evaluationId)).retryAvailable, true);
  const refusal = fixture(); refusal.flags.observe = new ProcessingError('AI_REFUSAL', false); await assert.rejects(refusal.run); assert.equal((await refusal.service.get('owner', refusal.source.evaluationId)).retryAvailable, false);
});
test('concurrent retry requests queue a single retry; queue failure restores FAILED', async () => {
  const f = fixture(); f.flags.observe = new ProcessingError('AI_TIMEOUT', true); await assert.rejects(f.run);
  await Promise.allSettled([f.service.retry('owner', f.source.evaluationId), f.service.retry('owner', f.source.evaluationId)]); assert.equal(f.calls.retry, 1);
  const broken = fixture(); broken.flags.observe = new ProcessingError('AI_TIMEOUT', true); await assert.rejects(broken.run); broken.flags.retry = true;
  await assert.rejects(() => broken.service.retry('owner', broken.source.evaluationId)); assert.equal(broken.source.status, 'ANALYSIS_FAILED'); assert.equal(broken.job.failures, 1);
});
test('publishing failure metadata keeps UI polling until the job has actually failed', async () => {
  const f = fixture(); await f.service.ensureScheduled(f.source.evaluationId); f.source.status = 'ANALYSIS_FAILED'; f.job.state = 'active'; f.job.stage = 'GENERATING_REPORT';
  assert.equal((await f.service.get('owner', f.source.evaluationId)).status, 'ANALYZING'); f.job.state = 'failed'; f.job.retryable = true; f.job.errorCode = 'AI_TIMEOUT'; f.job.failures = 1;
  const state = await f.service.get('owner', f.source.evaluationId); assert.equal(state.errorCode, 'AI_TIMEOUT'); assert.equal(state.retryAvailable, true);
});
test('unauthorized ownership and inactive account checks precede external access; audio requires report evidence', async () => {
  const f = fixture(); await assert.rejects(() => f.service.get('other', f.source.evaluationId), (e) => e.code === 'NOT_FOUND');
  await assert.rejects(() => f.service.answerAudio('owner', f.source.evaluationId, f.source.answers[0].answerId), (e) => e.code === 'NOT_FOUND'); assert.equal(f.calls.audio, 0);
  await f.run(); await assert.rejects(() => f.service.answerAudio('owner', f.source.evaluationId, randomUUID()), (e) => e.code === 'NOT_FOUND');
  assert.equal((await f.service.answerAudio('owner', f.source.evaluationId, f.source.answers[0].answerId)).mimeType, 'audio/webm'); f.setInactive(); await assert.rejects(() => f.service.get('owner', f.source.evaluationId));
});
test('pending answer prevents analysis; queue registration failure retains pending input', async () => {
  const f = fixture(); f.source.answers[0].processingStatus = 'PROCESSING'; await assert.rejects(f.run, (e) => e.code === 'CONFLICT'); assert.equal(f.calls.observe, 0);
  const pending = fixture(); pending.flags.enqueue = true; await assert.rejects(() => pending.service.analyze('owner', pending.source.evaluationId)); assert.equal(pending.source.status, 'ANALYSIS_PENDING'); assert.equal(pending.source.answers.length, 5);
});
test('malformed speech flags and empty report text fail runtime validation', () => {
  assert.throws(() => parseSpeech({ ...observation('a'), transcriptUsable: 'yes' }, 'a')); assert.throws(() => parseSpeech({ ...observation('a'), exclusionReason: 'contradiction' }, 'a'));
  const r = assessment([randomUUID()]); r.summary = ''; assert.throws(() => parseAssessment(r));
  assert.equal(canRetry({ state: 'active', failures: 0, retryable: true, retryAfterAt: null }, new Date()), false);
});

test('without reliable English transcripts, audio-only observations cannot create an overall level', () => {
  const answerId = randomUUID(); const turns = [{ answerId, speech: observation(answerId, { transcriptUsable: false, exclusionReason: '전사 불일치' }) }];
  const result = assessment([answerId]);
  for (const index of [0, 1, 4]) Object.assign(result.criteria[index], { score: null, insufficientReason: '전사 불일치', evidence: [], feedback: [] });
  assert.throws(() => validateAssessment(result, turns), (e) => e.publicCode === 'AI_INVALID_OUTPUT');
  result.finalLevelCode = null; assert.equal(validateAssessment(result, turns).verdict, 'UNASSESSABLE');
});
