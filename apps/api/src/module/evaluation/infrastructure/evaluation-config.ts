import { Injectable } from '@nestjs/common';
import type { EvaluationSettings } from '../application/evaluation.ports';
import type { Options, TopicCode } from '../application/evaluation.contracts';

const topics = [
  { code: 'DAILY_LIFE' as const, label: '일상', description: '일과, 취미, 음식과 생활 경험', context: 'Daily routines, hobbies, food and ordinary life experiences.' },
  { code: 'TRAVEL' as const, label: '여행', description: '여행 경험, 계획, 이동과 숙박', context: 'Travel experiences and plans, transportation and accommodation.' },
  { code: 'WORK' as const, label: '직장', description: '업무, 협업과 직장에서의 경험', context: 'General work experiences and teamwork. Do not require specialist knowledge.' },
];

function integer(name: string, fallback: number, min = 1, max = 3600): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

function ttsVoice() {
  const voices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'] as const;
  const voice = voices.find((voice) => voice === (process.env.OPENAI_TTS_VOICE ?? 'coral'));
  if (!voice) throw new Error('Invalid OPENAI_TTS_VOICE');
  return voice;
}

@Injectable()
export class EvaluationConfig implements EvaluationSettings {
  readonly maximumExecutions = 3;
  readonly maximumAudioBytes = 1024 * 1024;
  readonly maximumDurationSeconds = 600;
  readonly maximumAnswerBytes = 10 * 1024 * 1024;
  readonly resumeWindowSeconds = 300;
  readonly sttModel = process.env.OPENAI_STT_MODEL ?? 'gpt-4o-mini-transcribe';
  readonly sttTimeoutMs = integer('OPENAI_STT_TIMEOUT_MS', 30000, 1000, 120000);
  readonly llmModel = process.env.OPENAI_LLM_MODEL ?? 'gpt-4o-mini';
  readonly ttsModel = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
  readonly ttsVoice = ttsVoice();
  readonly openaiKey = process.env.OPENAI_API_KEY ?? '';
  readonly llmTimeoutMs = integer('OPENAI_LLM_TIMEOUT_MS', 30000, 1000, 120000);
  readonly ttsTimeoutMs = integer('OPENAI_TTS_TIMEOUT_MS', 30000, 1000, 120000);
  readonly redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  readonly bucket = process.env.MINIO_BUCKET ?? 'audio';
  readonly minioEndpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  readonly minioPort = integer('MINIO_PORT', 9000, 1, 65535);
  readonly minioSsl = process.env.MINIO_USE_SSL === 'true';
  readonly minioAccessKey = process.env.MINIO_ACCESS_KEY ?? 'root';
  readonly minioSecretKey = process.env.MINIO_SECRET_KEY ?? 'root-password-change-me';
  readonly ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe';
  readonly ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';

  options(): Options {
    return {
      topics: topics.map(({ code, label, description }) => ({ code, label, description })),
      startingBands: [
        { code: 'BEGINNER', label: '초급' }, { code: 'INTERMEDIATE', label: '중급' }, { code: 'ADVANCED', label: '고급' },
      ],
      maximumDurationSeconds: this.maximumDurationSeconds,
    };
  }

  topicContext(code: TopicCode): string {
    const topic = topics.find((topic) => topic.code === code);
    if (!topic) throw new Error('Unknown topic');
    return topic.context;
  }
}
