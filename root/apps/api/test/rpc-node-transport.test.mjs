import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { TRPCError } from '@trpc/server';
import { nodeHTTPRequestHandler } from '@trpc/server/adapters/node-http';
import { appRouter } from '@root/trpc-contract';

const require = createRequire(import.meta.url);
const express = require(require.resolve('express', { paths: [require.resolve('@nestjs/platform-express')] }));
const { preserveMultipartBody } = require(join(process.env.TRPC_UNIT_OUTPUT, 'multipart-request.js'));
const origin = 'http://localhost:5173';

function answerForm(mimeType = 'audio/webm;codecs=opus') {
  const form = new FormData();
  form.set('evaluationId', randomUUID());
  form.set('questionId', randomUUID());
  form.set('audio', new Blob([new Uint8Array([0, 1, 127, 255])], { type: mimeType }), 'answer');
  return form;
}

async function dispatch(body, { path = 'evaluation.submitAnswer', fix = true, headers = {} } = {}) {
  const request = new Request(`http://localhost/trpc/${path}`, {
    method: 'POST', body, headers: { authorization: 'Bearer valid', origin, ...headers },
  });
  const bytes = Buffer.from(await request.arrayBuffer());
  const req = new IncomingMessage(new Socket());
  req.method = 'POST'; req.url = `/trpc/${path}`;
  req.headers = { ...Object.fromEntries(request.headers), host: 'localhost', 'content-length': String(bytes.length) };
  const chunks = [];
  const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.statusCode = 200; res.setHeader = () => {};
  // These are the actual default parsers installed by Nest's Express adapter.
  const parsed = (middleware) => new Promise((resolve, reject) => middleware(req, res, (error) => error ? reject(error) : resolve()));
  const parsers = (async () => { await parsed(express.json()); await parsed(express.urlencoded({ extended: true })); })();
  req.push(bytes); req.complete = true; req.push(null);
  await parsers;
  assert.ok(Object.hasOwn(req, 'body'));
  const parsedBody = req.body;
  if (fix) preserveMultipartBody(req);

  const calls = [];
  await nodeHTTPRequestHandler({
    req, res, path, router: appRouter, maxBodySize: 10 * 1024 * 1024 + 64 * 1024,
    createContext: () => ({
      authorization: req.headers.authorization, origin: req.headers.origin, webOrigin: origin,
      setRefreshCookie() {}, clearRefreshCookie() {},
      controller: {
        auth: {
          async verifyAccess(value) { if (value !== 'Bearer valid') throw new TRPCError({ code: 'UNAUTHORIZED' }); return 'owner'; },
          async checkActive() {},
        },
        evaluation: {
          async submitAnswer(userId, form) { calls.push({ userId, form }); return { accepted: true }; },
          async create(userId, input) { calls.push({ userId, input }); return { created: true }; },
        },
      },
    }),
  });
  return { status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()), calls, parsedBody, req };
}

test('Nest default parsers reproduce the original multipart 400 before the controller', async () => {
  const response = await dispatch(answerForm(), { fix: false });
  assert.equal(response.status, 400);
  assert.equal(response.data.error.message, 'Failed to parse body as FormData.');
  assert.equal(response.calls.length, 0);
});

test('Nest to tRPC Node adapter preserves multipart identifiers, MIME and original bytes', async () => {
  for (const mime of ['audio/webm;codecs=opus', 'audio/mp4']) {
    const form = answerForm(mime);
    const response = await dispatch(form);
    assert.equal(response.status, 200);
    assert.equal(response.calls.length, 1);
    assert.equal(response.calls[0].userId, 'owner');
    const received = response.calls[0].form;
    assert.equal(received.get('evaluationId'), form.get('evaluationId'));
    assert.equal(received.get('questionId'), form.get('questionId'));
    assert.equal(received.get('audio').type, mime);
    assert.deepEqual(new Uint8Array(await received.get('audio').arrayBuffer()), new Uint8Array([0, 1, 127, 255]));
    assert.equal(Object.hasOwn(response.req, 'body'), false);
  }
});

test('parsed JSON still reaches its controller without altering the body', async () => {
  const input = { evaluationId: randomUUID(), topicCode: 'TRAVEL', startingBandCode: 'BEGINNER' };
  const response = await dispatch(JSON.stringify(input), { path: 'evaluation.create', headers: { 'content-type': 'application/json' } });
  assert.equal(response.status, 200);
  assert.equal(response.req.body, response.parsedBody);
  assert.deepEqual(response.calls[0].input, input);
});

test('Node multipart keeps authentication, Origin and identifier validation', async () => {
  for (const [headers, status] of [[{ authorization: '' }, 401], [{ origin: 'https://other.test' }, 403]]) {
    const response = await dispatch(answerForm(), { headers });
    assert.equal(response.status, status);
    assert.equal(response.calls.length, 0);
  }
  const form = answerForm(); form.set('questionId', 'invalid');
  const response = await dispatch(form);
  assert.equal(response.status, 400);
  assert.equal(response.calls.length, 0);
});
