import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { TRPCError } from '@trpc/server';
import { appRouter } from '@root/trpc-contract';
function fixture() {
  const calls = [];
  const methods = Object.fromEntries(['get', 'analyze', 'retry', 'history', 'answerAudio'].map((name) => [name, async (...args) => { calls.push([name, ...args]); return { accepted: true }; }]));
  const handler = (req) => fetchRequestHandler({ endpoint: '/trpc', req, router: appRouter, createContext: () => ({
    origin: req.headers.get('origin') ?? undefined, authorization: req.headers.get('authorization') ?? undefined, webOrigin: 'http://localhost:5173',
    setRefreshCookie() {}, clearRefreshCookie() {}, controller: {
      auth: { async verifyAccess(token) { if (token !== 'Bearer valid') throw new TRPCError({ code: 'UNAUTHORIZED' }); return 'owner'; }, async checkActive() {} }, report: methods,
    },
  }) });
  function request(name, input, { method = 'GET', headers = {} } = {}) {
    return new Request(`http://localhost/trpc/report.${name}${method === 'GET' ? `?input=${encodeURIComponent(JSON.stringify(input))}` : ''}`, {
      method, headers: { authorization: 'Bearer valid', origin: 'http://localhost:5173', 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(input) } : {}),
    });
  }
  return { handler, request, calls };
}
test('report queries/mutations route to controllers with authenticated user ID', async () => {
  const f = fixture(); const evaluationId = randomUUID(); const answerId = randomUUID();
  for (const name of ['analyze', 'retry']) assert.equal((await f.handler(f.request(name, { evaluationId, userId: 'other' }, { method: 'POST' }))).status, 200);
  assert.equal((await f.handler(f.request('get', { evaluationId }))).status, 200);
  assert.equal((await f.handler(f.request('answerAudio', { evaluationId, answerId }))).status, 200);
  assert.equal((await f.handler(f.request('history', { page: 2, pageSize: 10 }))).status, 200);
  assert.ok(f.calls.every((c) => c[1] === 'owner')); assert.deepEqual(f.calls.at(-1), ['history', 'owner', { page: 2, pageSize: 10 }]);
});
test('report mutations enforce Origin and all report routes require JWT', async () => {
  const f = fixture(); const input = { evaluationId: randomUUID() };
  assert.equal((await f.handler(f.request('get', input, { headers: { authorization: '' } }))).status, 401);
  assert.equal((await f.handler(f.request('analyze', input, { method: 'POST', headers: { origin: 'https://other.test' } }))).status, 403);
  assert.equal(f.calls.length, 0);
});
test('malformed identifiers and out-of-range pagination never reach a controller', async () => {
  const f = fixture();
  for (const [name, input] of [['get', { evaluationId: 'wrong' }], ['answerAudio', { evaluationId: randomUUID(), answerId: 'wrong' }], ['history', { page: 0 }], ['history', { page: 1.1 }], ['history', { pageSize: 51 }]]) assert.equal((await f.handler(f.request(name, input))).status, 400);
  assert.equal(f.calls.length, 0);
});
