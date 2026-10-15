import 'reflect-metadata';
import OpenAI from 'openai';
import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ReportConfig } from './module/report/infrastructure/report-config';
import { OpenAIReportGateway } from './module/report/infrastructure/openai-report.gateway';
import { WavPreparation } from './module/report/infrastructure/wav-preparation';
import { validateAssessment } from './module/report/domain/report-policy';
import { ProcessingError } from './shared/processing-error';
import { classifyAIError } from './shared/openai-error';
loadEnv({ path: resolve(__dirname, '../../../.env') });
async function main() {
  const config = new ReportConfig(); const gateway = new OpenAIReportGateway(config);
  const ttsModel = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
  console.log(JSON.stringify({ keyPresent: Boolean(config.key.trim()), audioModel: config.audioModel, llmModel: config.llmModel, ttsModel, sample: process.env.REPORT_TEST_AUDIO ? 'USER_RECORDING' : 'SYNTHETIC_VOICE', timeoutsMs: { audioInput: config.sampleTtsTimeoutMs, audio: config.audioTimeoutMs, llm: config.llmTimeoutMs } }));
  let operation = 'REPORT_AUDIO_INPUT';
  let startedAt = Date.now();
  let timeoutMs: number | null = process.env.REPORT_TEST_AUDIO ? null : config.sampleTtsTimeoutMs;
  function start(next: string, limit: number | null) {
    operation = next; startedAt = Date.now(); timeoutMs = limit;
    console.log(JSON.stringify({ operation, result: 'STARTED', timeoutMs }));
  }
  function success(details: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ operation, result: 'OK', elapsedMs: Date.now() - startedAt, timeoutMs, ...details }));
  }
  try {
    start('REPORT_AUDIO_INPUT', timeoutMs);
    if (!config.key.trim()) throw new ProcessingError('AI_KEY_MISSING', true);
    let transcript = process.env.REPORT_TEST_TRANSCRIPT ?? 'I enjoy working with my colleagues because we can share ideas and solve difficult problems together.';
    let wav: Uint8Array;
    if (process.env.REPORT_TEST_AUDIO) {
      if (!process.env.REPORT_TEST_TRANSCRIPT?.trim()) throw new ProcessingError('CHECK_TRANSCRIPT_REQUIRED', false);
      transcript = process.env.REPORT_TEST_TRANSCRIPT;
      wav = await new WavPreparation(config).wav(await readFile(process.env.REPORT_TEST_AUDIO));
    } else {
      const client = new OpenAI({ apiKey: config.key, maxRetries: 0 });
      const speech = await client.audio.speech.create({ model: ttsModel, voice: 'coral', response_format: 'wav', input: transcript }, { timeout: config.sampleTtsTimeoutMs });
      wav = new Uint8Array(await speech.arrayBuffer());
    }
    success();
    const answerId = randomUUID(); const question = 'Why do you enjoy working with other people?';
    start('REPORT_AUDIO', config.audioTimeoutMs);
    const observation = await gateway.observe({ answerId, question, transcript, wav });
    success({ transcriptUsable: observation.transcriptUsable });
    start('REPORT_LLM', config.llmTimeoutMs);
    const turns = [{ answerId, questionId: randomUUID(), question, transcript, processingStatus: 'COMPLETED', objectKey: 'diagnostic-only', mimeType: 'audio/wav', durationMs: 1, speech: observation }];
    const report = validateAssessment(await gateway.assess({ topicCode: 'WORK', endReason: 'USER_ENDED', turns, excluded: [] }), turns);
    success({ verdict: report.verdict, criteria: report.criteria.length });
  } catch (error) {
    const failure = classifyAIError(error); process.exitCode = 1;
    console.log(JSON.stringify({ operation, result: 'FAILED', elapsedMs: Date.now() - startedAt, timeoutMs, errorCode: failure.publicCode, ...failure.diagnostic }));
  }
}
void main().catch(() => { console.error('Report check could not start: check model and timeout settings.'); process.exitCode = 1; });
