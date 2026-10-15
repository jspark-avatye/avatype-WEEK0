import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createTRPCProxyClient, httpLink } from '@trpc/client';
const url = process.env.EVALUATION_TEST_URL ?? 'http://localhost:5173/trpc';
const origin = process.env.EVALUATION_TEST_ORIGIN ?? 'http://localhost:5173';
function browser() {
  const state = { token: null };
  const rpc = createTRPCProxyClient({ links: [httpLink({ url, headers: () => ({ origin, ...(state.token ? { authorization: `Bearer ${state.token}` } : {}) }) })] });
  return { state, rpc };
}
async function account(client) {
  const password = 'report-integration-password'; const loginId = `r${randomBytes(6).toString('hex')}`;
  client.state.token = (await client.rpc.auth.signup.mutate({ loginId, password, passwordConfirm: password })).accessToken;
}
async function start(client) {
  const evaluationId = randomUUID();
  await client.rpc.evaluation.create.mutate({ evaluationId, topicCode: 'WORK', startingBandCode: 'BEGINNER' }); await client.rpc.evaluation.start.mutate({ evaluationId });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const progress = await client.rpc.evaluation.get.query({ evaluationId });
    if (progress.phase === 'FAILED') assert.fail(`First-question operation failed: ${progress.errorCode}`);
    if (progress.phase === 'READY_TO_ANSWER') return { evaluationId, questionId: progress.question.questionId };
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.fail('Question was not ready in time');
}
async function report(client, evaluationId) {
  await client.rpc.report.analyze.mutate({ evaluationId }); const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const state = await client.rpc.report.get.query({ evaluationId });
    if (state.status === 'ANALYSIS_FAILED') assert.fail(`Report analysis failed: ${state.errorCode}`);
    if (state.status === 'COMPLETED') return state.report;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.fail('Report was not ready in time');
}
test('real stack: an unanswered assessment yields insufficient results, history and owned immutable report', { timeout: 180000 }, async () => {
  const client = browser(); const other = browser(); await account(client); await account(other);
  const { evaluationId } = await start(client); await client.rpc.evaluation.end.mutate({ evaluationId });
  const result = await report(client, evaluationId); assert.equal(result.verdict, 'UNASSESSABLE'); assert.equal(result.finalLevelCode, null); assert.equal(result.criteria.length, 5);
  assert.ok(result.criteria.every((c) => c.score === null && c.insufficientReason));
  assert.equal((await client.rpc.report.analyze.mutate({ evaluationId })).report.reportId, result.reportId);
  await assert.rejects(() => client.rpc.report.retry.mutate({ evaluationId }), (e) => e.data?.code === 'CONFLICT');
  await assert.rejects(() => other.rpc.report.get.query({ evaluationId }), (e) => e.data?.code === 'NOT_FOUND');
  assert.ok((await client.rpc.report.history.query({ page: 1, pageSize: 10 })).items.some((i) => i.evaluationId === evaluationId && i.status === 'COMPLETED'));
  assert.equal((await client.rpc.auth.me.query()).currentLevelCode, null);
});
test('real recording: upload -> STT -> report audio analysis/LLM -> evidence playback bytes', { timeout: 480000, skip: !process.env.REPORT_TEST_AUDIO }, async () => {
  const client = browser(); const other = browser(); await account(client); await account(other);
  const { evaluationId, questionId } = await start(client); const bytes = await readFile(process.env.REPORT_TEST_AUDIO);
  const mime = process.env.REPORT_TEST_AUDIO.endsWith('.mp4') ? 'audio/mp4' : 'audio/webm';
  const form = new FormData(); form.set('evaluationId', evaluationId); form.set('questionId', questionId); form.set('audio', new Blob([bytes], { type: mime }), mime === 'audio/mp4' ? 'answer.mp4' : 'answer.webm');
  const accepted = await client.rpc.evaluation.submitAnswer.mutate(form); await client.rpc.evaluation.end.mutate({ evaluationId });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) { if ((await client.rpc.evaluation.get.query({ evaluationId })).status !== 'ENDING') break; await new Promise((resolve) => setTimeout(resolve, 1000)); }
  const result = await report(client, evaluationId); assert.equal(result.criteria.length, 5); assert.notEqual(result.verdict, 'CONFIRMED');
  const evidence = result.criteria.flatMap((c) => c.evidence); assert.ok(evidence.some((e) => e.answerId === accepted.latestAnswer.answerId));
  const audio = await client.rpc.report.answerAudio.query({ evaluationId, answerId: accepted.latestAnswer.answerId }); assert.deepEqual(Buffer.from(audio.audioBase64, 'base64'), bytes);
  await assert.rejects(() => other.rpc.report.answerAudio.query({ evaluationId, answerId: accepted.latestAnswer.answerId }), (e) => e.data?.code === 'NOT_FOUND');
});
