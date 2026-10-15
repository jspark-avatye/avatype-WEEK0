import { Injectable } from '@nestjs/common';
function timeout(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1000 || value > 120000) throw new Error(`Invalid ${name}`);
  return value;
}
@Injectable()
export class ReportConfig {
  readonly key = process.env.OPENAI_API_KEY ?? '';
  readonly audioModel = process.env.OPENAI_REPORT_AUDIO_MODEL ?? 'gpt-audio-1.5';
  readonly llmModel = process.env.OPENAI_REPORT_LLM_MODEL ?? 'gpt-4o-mini';
  readonly audioTimeoutMs = timeout('OPENAI_REPORT_AUDIO_TIMEOUT_MS', 120000);
  readonly llmTimeoutMs = timeout('OPENAI_REPORT_LLM_TIMEOUT_MS', 60000);
  readonly sampleTtsTimeoutMs = timeout('OPENAI_TTS_TIMEOUT_MS', 30000);
  readonly redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  readonly ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
}
