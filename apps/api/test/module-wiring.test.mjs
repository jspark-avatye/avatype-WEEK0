import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { DatabaseModule, PRISMA_CLIENT } = require('../dist/database/database.module.js');
const { AudioStorageModule } = require('../dist/audio/audio-storage.module.js');
const { MinioAudioStorage } = require('../dist/audio/minio-audio-storage.js');
const { ReportModule } = require('../dist/module/report/report.module.js');
const { EvaluationModule } = require('../dist/module/evaluation/evaluation.module.js');
const { BullMQReportQueue } = require('../dist/module/report/infrastructure/bullmq-report.queue.js');
const { BullMQConversationQueue } = require('../dist/module/evaluation/infrastructure/bullmq-conversation.queue.js');
const { ReportController } = require('../dist/module/report/report.controller.js');
const { TrpcController } = require('../dist/trpc/trpc.controller.js');
const { REPORT_USE_CASE } = require('../dist/module/report/application/report.ports.js');
function replace(module, token, value) {
  const providers = Reflect.getMetadata('providers', module);
  Reflect.defineMetadata('providers', providers.map((p) => (typeof p === 'function' ? p : p.provide) === token ? { provide: token, useValue: value } : p), module);
}
test('actual Nest module graph resolves controllers and both workers without a circular dependency', async () => {
  let workers = 0; process.env.JWT_ACCESS_SECRET = 'isolated-wiring-test-secret-long-enough';
  replace(DatabaseModule, PRISMA_CLIENT, { async $disconnect() {} }); replace(AudioStorageModule, MinioAudioStorage, { async read() { return new Uint8Array([1]); } });
  replace(ReportModule, BullMQReportQueue, { startWorker() { workers++; } }); replace(EvaluationModule, BullMQConversationQueue, { startWorker() { workers++; } });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
  try { assert.ok(app.get(TrpcController)); assert.ok(app.get(ReportController)); assert.equal(typeof app.get(REPORT_USE_CASE).process, 'function'); assert.equal(workers, 2); }
  finally { await app.close(); }
});
