import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { OpenAIReportGateway } = require('../dist/module/report/infrastructure/openai-report.gateway.js');
const config = { key: 'test-key-never-sent', audioModel: 'gpt-audio-1.5', llmModel: 'gpt-4o-mini', audioTimeoutMs: 1000, llmTimeoutMs: 1000 };
const voice = { transcriptUsable: true, exclusionReason: null, pronunciation: { assessable: true, observation: '발음이 명료합니다.' }, fluency: { assessable: true, observation: '문장을 연결합니다.' } };
function report(answerId) { return { finalLevelCode: 'INTERMEDIATE_LOW', summary: '의견을 설명합니다.', criteria: ['VOCABULARY', 'GRAMMAR', 'PRONUNCIATION', 'FLUENCY', 'RELEVANCE'].map((criterionCode) => ({ criterionCode, score: 60, insufficientReason: null, rationale: '실제 답변 근거입니다.', evidence: [{ answerId, explanation: '의견을 설명한 답변입니다.' }], feedback: [{ feedbackKind: 'IMPROVEMENT', suggestion: '이유를 더 설명해 보세요.', explanation: '설명의 깊이를 늘립니다.' }] })) }; }
async function fakeFetch(handler, run) { const previous = globalThis.fetch; globalThis.fetch = handler; try { return await run(); } finally { globalThis.fetch = previous; } }
test('real OpenAI SDK sends WAV with text-only function output and validates its arguments', async () => {
  const answerId = randomUUID();
  await fakeFetch(async (url, init) => {
    assert.ok(String(url).endsWith('/chat/completions')); const body = JSON.parse(init.body);
    assert.equal(body.model, config.audioModel); assert.deepEqual(body.modalities, ['text']); assert.equal(body.tools[0].function.strict, false); assert.equal(body.store, false);
    const parts = body.messages[1].content; assert.equal(parts[1].input_audio.format, 'wav'); assert.equal(parts[1].input_audio.data, Buffer.from([0, 1, 2]).toString('base64'));
    return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'call', type: 'function', function: { name: 'submit_speech_observation', arguments: JSON.stringify(voice) } }] } }] });
  }, async () => {
    const result = await new OpenAIReportGateway(config).observe({ answerId, question: 'Why?', transcript: 'I enjoy collaboration.', wav: new Uint8Array([0, 1, 2]) });
    assert.equal(result.answerId, answerId); assert.equal(result.pronunciation.assessable, true);
  });
});
test('audio stop responses accept a complete function call and still validate its arguments', async () => {
  const answerId = randomUUID();
  const response = (argumentsValue) => Response.json({ choices: [{ finish_reason: 'stop', message: {
    tool_calls: [{ id: 'call', type: 'function', function: { name: 'submit_speech_observation', arguments: JSON.stringify(argumentsValue) } }],
  } }] });
  await fakeFetch(async () => response(voice), async () => {
    const result = await new OpenAIReportGateway(config).observe({ answerId, question: 'Why?', transcript: 'I enjoy collaboration.', wav: new Uint8Array([1]) });
    assert.deepEqual(result, { answerId, ...voice });
  });
  await fakeFetch(async () => response({ ...voice, transcriptUsable: 'true' }), async () => {
    await assert.rejects(() => new OpenAIReportGateway(config).observe({ answerId, question: 'Why?', transcript: 'Answer', wav: new Uint8Array([1]) }),
      (error) => error.publicCode === 'AI_INVALID_OUTPUT' && error.diagnostic.reason === 'EXPECTED_BOOLEAN' && error.diagnostic.param === 'transcriptUsable');
  });
});
test('final report uses strict schema and never forwards private object keys or unreliable transcript text', async () => {
  const answerId = randomUUID();
  await fakeFetch(async (url, init) => {
    assert.ok(String(url).endsWith('/responses')); const body = JSON.parse(init.body); assert.equal(body.text.format.strict, true); assert.equal(body.max_output_tokens, 6000);
    const data = JSON.parse(body.input); assert.equal(data.turns[0].transcript, null); assert.ok(!body.input.includes('private-object')); assert.ok(!body.input.includes('unreliable secret text'));
    return Response.json({ status: 'completed', output: [], output_text: JSON.stringify(report(answerId)) });
  }, async () => {
    const result = await new OpenAIReportGateway(config).assess({ topicCode: 'WORK', endReason: 'USER_ENDED', excluded: [], turns: [{ answerId, question: 'Why?', transcript: 'unreliable secret text', objectKey: 'private-object', speech: { ...voice, transcriptUsable: false, exclusionReason: '전사 불일치' } }] });
    assert.equal(result.criteria.length, 5);
  });
});
test('audio provider authentication is a processing error, not a member HTTP 401; SDK does not retry', async () => {
  let calls = 0;
  await fakeFetch(async () => { calls++; return Response.json({ error: { message: 'private error body', code: 'invalid_api_key', type: 'invalid_request_error' } }, { status: 401, headers: { 'x-request-id': 'provider-id' } }); }, async () => {
    await assert.rejects(() => new OpenAIReportGateway(config).observe({ answerId: randomUUID(), question: 'Why?', transcript: 'Answer', wav: new Uint8Array([1]) }), (e) => e.publicCode === 'AI_AUTH_FAILED' && e.diagnostic.requestId === 'provider-id');
    assert.equal(calls, 1);
  });
});
test('missing or malformed audio tool arguments fail rather than inventing observations', async () => {
  await fakeFetch(async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'plain text' } }] }), async () => {
    await assert.rejects(() => new OpenAIReportGateway(config).observe({ answerId: randomUUID(), question: 'Why?', transcript: 'Answer', wav: new Uint8Array([1]) }), (e) => e.publicCode === 'AI_INVALID_OUTPUT' && e.diagnostic.reason === 'EXPECTED_ONE_TOOL_CALL' && e.diagnostic.finishReason === 'stop' && e.diagnostic.toolCallCount === 0);
  });
});
test('audio diagnostics distinguish truncated output, tool errors, JSON and nested schema without logging content', async () => {
  const tool = (argumentsValue, name = 'submit_speech_observation') => ({ id: 'call', type: 'function', function: { name, arguments: typeof argumentsValue === 'string' ? argumentsValue : JSON.stringify(argumentsValue) } });
  const choice = (tools, finish = 'tool_calls') => ({ finish_reason: finish, message: { tool_calls: tools } });
  for (const [choices, reason, param] of [
    [[], 'MISSING_CHOICE'],
    [[choice([tool(voice)], 'length')], 'OUTPUT_TRUNCATED'],
    [[choice([tool(voice)], 'content_filter')], 'UNEXPECTED_FINISH_REASON'],
    [[choice([])], 'EXPECTED_ONE_TOOL_CALL'],
    [[choice([tool(voice), tool(voice)])], 'EXPECTED_ONE_TOOL_CALL'],
    [[choice([tool(voice, 'private-unexpected-tool')])], 'UNEXPECTED_TOOL_NAME'],
    [[choice([tool('private malformed recording contents {')])], 'INVALID_JSON'],
    [[choice([tool({ ...voice, pronunciation: {} })])], 'EXPECTED_BOOLEAN', 'pronunciation.assessable'],
    [[choice([tool({ ...voice, fluency: { assessable: true, observation: '' } })])], 'EMPTY_STRING', 'fluency.observation'],
    [[choice([tool({ ...voice, exclusionReason: 'private contradictory transcript' })])], 'TRANSCRIPT_REASON_MISMATCH', 'exclusionReason'],
  ]) {
    await fakeFetch(async () => Response.json({ choices }, { headers: { 'x-request-id': 'audio-request-id' } }), async () => {
      await assert.rejects(() => new OpenAIReportGateway(config).observe({ answerId: randomUUID(), question: 'Why?', transcript: 'Private source', wav: new Uint8Array([1]) }), (error) => {
        assert.equal(error.publicCode, 'AI_INVALID_OUTPUT');
        assert.equal(error.diagnostic.reason, reason);
        assert.equal(error.diagnostic.param, param);
        assert.equal(error.diagnostic.requestId, 'audio-request-id');
        assert.ok(!JSON.stringify(error.diagnostic).toLowerCase().includes('private'));
        return true;
      });
    });
  }
});
