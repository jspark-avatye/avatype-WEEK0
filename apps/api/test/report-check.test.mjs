import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the compiled CLI and real SDK deadlines, replacing only HTTP.
// A stalled provider respects abort; no live API request or retry is made.
const hook = `
globalThis.fetch = async (url, init) => {
  const path = new URL(String(url)).pathname;
  const operation = path.endsWith('/audio/speech') ? 'REPORT_AUDIO_INPUT'
    : path.endsWith('/chat/completions') ? 'REPORT_AUDIO' : 'REPORT_LLM';
  if (operation === process.env.CHECK_TEST_FAILURE) {
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('Test deadline', 'AbortError'));
      if (init.signal.aborted) abort();
      else init.signal.addEventListener('abort', abort, { once: true });
    });
  }
  if (operation === 'REPORT_AUDIO_INPUT') return new Response(new Uint8Array(44));
  if (operation === 'REPORT_AUDIO') return Response.json({ choices: [{
    finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'call', type: 'function',
      function: { name: 'submit_speech_observation', arguments: JSON.stringify({
        transcriptUsable: true, exclusionReason: null,
        pronunciation: { assessable: true, observation: 'Clear speech.' },
        fluency: { assessable: true, observation: 'Connected speech.' }
      }) }
    }] }
  }] });
  throw new Error('A later stage must not run after timeout');
};
`;

async function check(operation) {
  const directory = await mkdtemp(join(tmpdir(), 'root-report-check-'));
  try {
    const preload = join(directory, 'http-fixture.mjs');
    await writeFile(preload, hook);
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', preload, fileURLToPath(new URL('../dist/report-check.js', import.meta.url))], {
        env: { ...process.env, OPENAI_API_KEY: 'test-key-never-sent', REPORT_TEST_AUDIO: '',
          OPENAI_TTS_TIMEOUT_MS: '1000', OPENAI_REPORT_AUDIO_TIMEOUT_MS: '2000', OPENAI_REPORT_LLM_TIMEOUT_MS: '3000',
          CHECK_TEST_FAILURE: operation },
      });
      let output = ''; let errors = '';
      child.stdout.on('data', (bytes) => { output += bytes; });
      child.stderr.on('data', (bytes) => { errors += bytes; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output, errors }));
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

for (const [operation, timeoutMs] of [['REPORT_AUDIO_INPUT', 1000], ['REPORT_AUDIO', 2000], ['REPORT_LLM', 3000]]) {
  test(`report check identifies ${operation} timeout with its configured deadline`, { timeout: 15000 }, async () => {
    const result = await check(operation);
    assert.equal(result.code, 1, result.errors);
    const logs = result.output.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
    const failure = logs.find((entry) => entry.result === 'FAILED');
    assert.equal(failure?.operation, operation);
    assert.equal(failure.errorCode, 'AI_TIMEOUT');
    assert.equal(failure.timeoutMs, timeoutMs);
    assert.ok(failure.elapsedMs >= timeoutMs - 100, JSON.stringify(failure));
    assert.ok(failure.elapsedMs < timeoutMs + 2000, 'SDK must not retry the timed out diagnostic');
    assert.equal(logs.filter((entry) => entry.result === 'STARTED').at(-1).operation, operation);
    assert.ok(!result.output.includes('test-key-never-sent'));
  });
}
