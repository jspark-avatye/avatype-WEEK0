import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { EvaluationConfig } from './module/evaluation/infrastructure/evaluation-config';
import { OpenAIConversationGateway } from './module/evaluation/infrastructure/openai-conversation.gateway';
import { ProcessingError } from './module/evaluation/domain/evaluation-error';
import { validateQuestion } from './module/evaluation/domain/evaluation-session';
loadEnv({ path: resolve(process.cwd(), '../../.env') });
async function main() {
  const config = new EvaluationConfig(); const ai = new OpenAIConversationGateway(config);
  console.log(JSON.stringify({ keyPresent: Boolean(config.openaiKey.trim()), llmModel: config.llmModel, sttModel: config.sttModel, ttsModel: config.ttsModel, voice: config.ttsVoice }));
  for (const [operation, run] of [
    ['LLM', async () => { validateQuestion(await ai.generateQuestion({ topic: 'Daily routines.', startingBand: 'BEGINNER', difficulty: 'BEGINNER_MID' })); }],
    ['TTS', async () => { await ai.synthesize('What do you enjoy doing on weekends?'); }],
  ] as const) {
    try { await run(); console.log(JSON.stringify({ operation, result: 'OK' })); }
    catch (error) {
      process.exitCode = 1;
      console.log(JSON.stringify({ operation, result: 'FAILED', errorCode: error instanceof ProcessingError ? error.publicCode : 'CHECK_FAILED', ...(error instanceof ProcessingError ? error.diagnostic : {}) }));
    }
  }
}
void main().catch(() => { console.error('AI check could not start: check model, voice and timeout configuration.'); process.exitCode = 1; });
