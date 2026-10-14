import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { TRPCError } from '@trpc/server';
import { appRouter } from '@root/trpc-contract';
function fixture() {
  let calls = 0;
  const handler = (request) => fetchRequestHandler({ endpoint: '/trpc', req: request, router: appRouter, createContext: () => ({
    authorization: request.headers.get('authorization') ?? undefined, origin: request.headers.get('origin') ?? undefined, webOrigin: 'http://localhost:5173',
    setRefreshCookie() {}, clearRefreshCookie() {}, controller: { auth: {
      async verifyAccess(value) { if (value !== 'Bearer valid') throw new TRPCError({ code: 'UNAUTHORIZED' }); return 'owner'; }, async checkActive() {},
    }, evaluation: { async submitAnswer(userId, form) { calls++; assert.equal(userId, 'owner'); assert.ok(form instanceof FormData); assert.equal(await form.get('audio').text(), 'voice'); return { accepted: true }; } } },
  }) });
  function request(form, headers = { authorization: 'Bearer valid', origin: 'http://localhost:5173' }) { return new Request('http://localhost:3000/trpc/evaluation.submitAnswer', { method: 'POST', headers, body: form }); }
  function form() { const f = new FormData(); f.set('evaluationId', randomUUID()); f.set('questionId', randomUUID()); f.set('audio', new Blob(['voice'], { type: 'audio/webm' }), 'voice.webm'); return f; }
  return { handler, request, form, get calls() { return calls; } };
}
test('native multipart tRPC preserves file bytes and routes through evaluation controller', async () => { const f = fixture(); const response = await f.handler(f.request(f.form())); assert.equal(response.status, 200); assert.equal(f.calls, 1); });
test('multipart is protected by JWT and Origin before controller', async () => { const f = fixture(); assert.equal((await f.handler(f.request(f.form(), { origin: 'http://localhost:5173' }))).status, 401); assert.equal((await f.handler(f.request(f.form(), { authorization: 'Bearer valid', origin: 'https://other.test' }))).status, 403); assert.equal(f.calls, 0); });
test('invalid identifiers, duplicate fields and files over limit fail before controller', async () => {
  const f = fixture(); const forms = [f.form(), f.form(), f.form()]; forms[0].set('questionId', 'wrong'); forms[1].append('evaluationId', randomUUID()); forms[2].set('audio', new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), 'large.webm');
  for (const form of forms) assert.equal((await f.handler(f.request(form))).status, 400); assert.equal(f.calls, 0);
});
