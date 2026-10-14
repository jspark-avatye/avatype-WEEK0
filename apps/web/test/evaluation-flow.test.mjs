import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { createTRPCClient, httpLink } from '@trpc/client';

// Requires a running migrated stack, an actual OPENAI_API_KEY and ffprobe.
const url = process.env.EVALUATION_TEST_URL ?? 'http://localhost:3000/trpc';
const origin = process.env.AUTH_TEST_ORIGIN ?? 'http://localhost:5173';
function client() {
  let token = '';
  const rpc = createTRPCClient({ links: [httpLink({ url, headers: () => ({ origin, authorization: `Bearer ${token}` }) })] });
  return { rpc, set token(value) { token = value; } };
}
async function signup(browser) {
  const loginId = `e${randomBytes(6).toString('hex')}`;
  const password = 'first-question-test-42';
  browser.token = (await browser.rpc.auth.signup.mutate({ loginId, password, passwordConfirm: password })).accessToken;
}

test('authenticated first question: idempotent creation/start, persisted question and private MP3', { timeout: 150000 }, async () => {
  const browser = client();
  const other = client();
  await signup(browser);
  await signup(other);
  const options = await browser.rpc.evaluation.options.query();
  assert.deepEqual(options.topics.map((topic) => topic.code), ['DAILY_LIFE', 'TRAVEL', 'WORK']);
  const input = { evaluationId: randomUUID(), topicCode: 'TRAVEL', startingBandCode: 'BEGINNER' };
  const results = await Promise.all([browser.rpc.evaluation.create.mutate(input), browser.rpc.evaluation.create.mutate(input)]);
  assert.equal(results[0].evaluationId, results[1].evaluationId);
  await assert.rejects(() => other.rpc.evaluation.get.query({ evaluationId: input.evaluationId }), (error) => error.data?.code === 'NOT_FOUND');
  await assert.rejects(() => browser.rpc.evaluation.create.mutate({ ...input, startingBandCode: 'ADVANCED' }), (error) => error.data?.code === 'CONFLICT');
  await Promise.all([browser.rpc.evaluation.start.mutate({ evaluationId: input.evaluationId }), browser.rpc.evaluation.start.mutate({ evaluationId: input.evaluationId })]);
  let state;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    state = await browser.rpc.evaluation.get.query({ evaluationId: input.evaluationId });
    if (state.phase === 'FAILED') assert.fail(`Real AI first-question job failed: ${state.errorCode}`);
    if (state.phase === 'READY_TO_ANSWER') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(state.phase, 'READY_TO_ANSWER');
  assert.equal(state.question.questionNo, 1);
  assert.equal(state.question.difficultyLevelCode, 'BEGINNER_MID');
  const started = await browser.rpc.evaluation.start.mutate({ evaluationId: input.evaluationId });
  assert.equal(started.question.questionId, state.question.questionId);
  assert.equal(started.question.audioId, state.question.audioId);
  const audio = await browser.rpc.evaluation.audio.query({ audioId: state.question.audioId });
  assert.equal(audio.mimeType, 'audio/mpeg');
  assert.ok(Buffer.from(audio.audioBase64, 'base64').length > 0);
  await assert.rejects(() => other.rpc.evaluation.audio.query({ audioId: state.question.audioId }), (error) => error.data?.code === 'NOT_FOUND');
  const paused = await browser.rpc.evaluation.pause.mutate({ evaluationId: input.evaluationId });
  assert.equal(paused.status, 'PAUSED');
  assert.ok((await browser.rpc.evaluation.resumable.query()).some((s) => s.evaluationId === input.evaluationId));
  await assert.rejects(() => browser.rpc.evaluation.audio.query({ audioId: state.question.audioId }), (error) => error.data?.code === 'NOT_FOUND');
  const resumed = await browser.rpc.evaluation.resume.mutate({ evaluationId: input.evaluationId });
  assert.equal(resumed.question.audioId, state.question.audioId);
  const ended = await browser.rpc.evaluation.end.mutate({ evaluationId: input.evaluationId });
  assert.ok(['ANALYSIS_PENDING', 'ANALYZING', 'COMPLETED', 'ANALYSIS_FAILED'].includes(ended.status));
});

// Supply a real browser WebM/MP4 recording; this exercises actual STT and the second turn.
test('real voice answer survives duplicate upload and pause, then resumes the prepared second question', { timeout: 180000, skip: !process.env.EVALUATION_TEST_AUDIO }, async () => {
  const { readFile } = await import('node:fs/promises');
  const browser = client(); await signup(browser);
  const evaluationId = randomUUID();
  await browser.rpc.evaluation.create.mutate({ evaluationId, topicCode: 'DAILY_LIFE', startingBandCode: 'BEGINNER' });
  await browser.rpc.evaluation.start.mutate({ evaluationId });
  async function ready() {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const state = await browser.rpc.evaluation.get.query({ evaluationId });
      if (state.phase === 'FAILED') assert.fail(`Real conversation failed: ${state.errorCode}`);
      if (state.phase === 'READY_TO_ANSWER') return state;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.fail('Conversation did not finish in time');
  }
  const first = await ready();
  const bytes = await readFile(process.env.EVALUATION_TEST_AUDIO);
  const mime = process.env.EVALUATION_TEST_AUDIO.endsWith('.mp4') ? 'audio/mp4' : 'audio/webm';
  const form = () => { const input = new FormData(); input.set('evaluationId', evaluationId); input.set('questionId', first.question.questionId); input.set('audio', new Blob([bytes], { type: mime }), mime === 'audio/mp4' ? 'answer.mp4' : 'answer.webm'); return input; };
  const [accepted, duplicate] = await Promise.all([browser.rpc.evaluation.submitAnswer.mutate(form()), browser.rpc.evaluation.submitAnswer.mutate(form())]);
  assert.equal(accepted.latestAnswer.answerId, duplicate.latestAnswer.answerId);
  await browser.rpc.evaluation.pause.mutate({ evaluationId });
  const next = await ready(); assert.equal(next.status, 'PAUSED'); assert.equal(next.question.questionNo, 2); assert.equal(next.actions.canRecord, false);
  const resumed = await browser.rpc.evaluation.resume.mutate({ evaluationId }); assert.equal(resumed.question.audioId, next.question.audioId);
  const audio = await browser.rpc.evaluation.audio.query({ audioId: next.question.audioId }); assert.ok(Buffer.from(audio.audioBase64, 'base64').byteLength > 0);
  assert.ok(['ANALYSIS_PENDING', 'ANALYZING', 'COMPLETED', 'ANALYSIS_FAILED'].includes((await browser.rpc.evaluation.end.mutate({ evaluationId })).status));
});
