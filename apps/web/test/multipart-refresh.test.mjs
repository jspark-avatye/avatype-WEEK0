import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
// Load the actual client source with a test URL; fetch remains the only substituted boundary.
function loadClient() {
  const tokens = { value: 'expired' };
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../src/shared/api/trpc.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports = (path) => path === '@/shared/config' ? { env: { trpcUrl: 'http://localhost:3000/trpc' } } : path === './access-token' ? { getAccessToken: () => tokens.value, setAccessToken: (v) => { tokens.value = v; } } : require(path);
  new Script('(function(require,module,exports){' + source + '\n})').runInThisContext()(imports, module, module.exports);
  return { ...module.exports, testTokens: tokens };
}
function result(data) { return new Response(JSON.stringify({ result: { data } }), { headers: { 'content-type': 'application/json' } }); }
function unauthorized() { return new Response(JSON.stringify({ error: { message: 'expired', code: -32001, data: { code: 'UNAUTHORIZED', httpStatus: 401 } } }), { status: 401, headers: { 'content-type': 'application/json' } }); }
test('Access JWT refresh retries actual client multipart without losing file or setting boundary manually', async () => {
  const originalFetch = globalThis.fetch; const originalWindow = globalThis.window;
  const calls = []; let refreshed = 0;
  globalThis.window = { location: { href: 'http://localhost:5173/' }, dispatchEvent() {} };
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('auth.refresh')) { refreshed++; return result({ accessToken: 'valid' }); }
    const headers = new Headers(options.headers);
    calls.push({ token: headers.get('authorization'), contentType: headers.get('content-type'), audio: await options.body.get('audio').text(), questionId: options.body.get('questionId') });
    return headers.get('authorization') === 'Bearer valid' ? result({ accepted: true }) : unauthorized();
  };
  try {
    const { trpcClient } = loadClient(); const form = new FormData(); form.set('evaluationId', 'e'); form.set('questionId', 'q'); form.set('audio', new Blob(['original voice'], { type: 'audio/webm' }), 'answer.webm');
    const response = await trpcClient.evaluation.submitAnswer.mutate(form);
    assert.equal(response.accepted, true); assert.equal(refreshed, 1);
    assert.deepEqual(calls, [{ token: 'Bearer expired', contentType: null, audio: 'original voice', questionId: 'q' }, { token: 'Bearer valid', contentType: null, audio: 'original voice', questionId: 'q' }]);
  } finally { globalThis.fetch = originalFetch; if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; }
});

test('evaluation.get forwards Bearer JWT and retries once after refresh', async () => {
  const previousFetch = globalThis.fetch; const previousWindow = globalThis.window;
  const requests = []; const notifications = [];
  globalThis.window = { location: { href: 'http://localhost:5173/' }, dispatchEvent: (event) => notifications.push(event.type) };
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    const token = new Headers(options.headers).get('authorization');
    requests.push({ path, token, credentials: options.credentials });
    if (path.endsWith('auth.refresh')) return result({ accessToken: 'valid' });
    return token === 'Bearer valid' ? result({ evaluationId: 'evaluation' }) : unauthorized();
  };
  try {
    const { trpcClient } = loadClient();
    assert.equal((await trpcClient.evaluation.get.query({ evaluationId: 'evaluation' })).evaluationId, 'evaluation');
    assert.deepEqual(requests.map((request) => request.path), ['/trpc/evaluation.get', '/trpc/auth.refresh', '/trpc/evaluation.get']);
    assert.equal(requests[0].token, 'Bearer expired'); assert.equal(requests[2].token, 'Bearer valid');
    assert.ok(requests.every((request) => request.credentials === 'same-origin')); assert.equal(notifications.length, 0);
  } finally { globalThis.fetch = previousFetch; if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});

test('parallel expired evaluation queries share one refresh request', async () => {
  const previousFetch = globalThis.fetch; const previousWindow = globalThis.window;
  let refreshes = 0; const notifications = [];
  globalThis.window = { location: { href: 'http://localhost:5173/' }, dispatchEvent: (event) => notifications.push(event.type) };
  globalThis.fetch = async (url, options) => {
    if (new URL(String(url)).pathname.endsWith('auth.refresh')) { refreshes++; return result({ accessToken: 'valid' }); }
    return new Headers(options.headers).get('authorization') === 'Bearer valid' ? result({ ok: true }) : unauthorized();
  };
  try {
    const { trpcClient } = loadClient();
    await Promise.all([trpcClient.evaluation.get.query({ evaluationId: 'first' }), trpcClient.evaluation.get.query({ evaluationId: 'second' })]);
    assert.equal(refreshes, 1); assert.equal(notifications.length, 0);
  } finally { globalThis.fetch = previousFetch; if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});

test('refresh rejection signals the authentication failure and does not retry forever', async () => {
  const previousFetch = globalThis.fetch; const previousWindow = globalThis.window;
  const requests = []; const notifications = [];
  globalThis.window = { location: { href: 'http://localhost:5173/' }, dispatchEvent: (event) => notifications.push(event.type) };
  globalThis.fetch = async (url) => { requests.push(new URL(String(url)).pathname); return unauthorized(); };
  try {
    const { trpcClient, testTokens } = loadClient();
    await assert.rejects(() => trpcClient.evaluation.get.query({ evaluationId: 'evaluation' }), (error) => error.data.code === 'UNAUTHORIZED');
    assert.deepEqual(requests, ['/trpc/evaluation.get', '/trpc/auth.refresh']); assert.equal(testTokens.value, null);
    assert.deepEqual(notifications, ['root:unauthorized']);
  } finally { globalThis.fetch = previousFetch; if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});

test('a 401 after the token has disappeared still clears the signed-in screen', async () => {
  const previousFetch = globalThis.fetch; const previousWindow = globalThis.window;
  const notifications = [];
  globalThis.window = { location: { href: 'http://localhost:5173/' }, dispatchEvent: (event) => notifications.push(event.type) };
  try {
    const { trpcClient, testTokens } = loadClient();
    globalThis.fetch = async () => { testTokens.value = null; return unauthorized(); };
    await assert.rejects(() => trpcClient.evaluation.get.query({ evaluationId: 'evaluation' }), (error) => error.data.code === 'UNAUTHORIZED');
    assert.deepEqual(notifications, ['root:unauthorized']);
  } finally { globalThis.fetch = previousFetch; if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});
