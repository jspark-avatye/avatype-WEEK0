import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
require('reflect-metadata');
require('dotenv').config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
const { PrismaClient, PrismaPg } = require('@root/database');
const { PrismaReportRepository } = require('../dist/module/report/infrastructure/prisma-report.repository.js');
const { PrismaAuthRepository } = require('../dist/module/auth/infrastructure/prisma-auth.repository.js');
const { PrismaEvaluationRepository } = require('../dist/module/evaluation/infrastructure/prisma-evaluation.repository.js');
const connectionString = process.env.REPORT_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://root:root@localhost:5432/root?schema=public';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 3000 }) });
const repository = new PrismaReportRepository(prisma); const users = []; const audioIds = [];
const codes = ['VOCABULARY', 'GRAMMAR', 'PRONUNCIATION', 'FLUENCY', 'RELEVANCE'];
before(async () => {
  const rows = await prisma.$queryRaw`SELECT to_regclass('evaluation_report')::text AS report`;
  assert.ok(rows[0].report, 'Apply the report migration before running DB integration tests.');
});
after(async () => {
  try {
    if (users.length) await prisma.$transaction(async (tx) => {
      const owner = { report: { evaluation: { userId: { in: users } } } };
      await tx.criterionEvidence.deleteMany({ where: { result: owner } }); await tx.criterionFeedback.deleteMany({ where: { result: owner } });
      await tx.criterionResult.deleteMany({ where: owner }); await tx.evaluationReport.deleteMany({ where: { evaluation: { userId: { in: users } } } });
      await tx.answer.deleteMany({ where: { question: { evaluation: { userId: { in: users } } } } }); await tx.question.deleteMany({ where: { evaluation: { userId: { in: users } } } });
      await tx.audioAsset.deleteMany({ where: { audioId: { in: audioIds } } }); await tx.evaluationSession.deleteMany({ where: { userId: { in: users } } }); await tx.userAccount.deleteMany({ where: { userId: { in: users } } });
    });
  } finally { await prisma.$disconnect(); }
});
async function fixture({ userId, offset = 0 } = {}) {
  const id = userId ?? randomUUID(); const evaluationId = randomUUID(); const ids = [];
  const start = new Date(Date.now() - 60000 + offset); const end = new Date(start.getTime() + 30000);
  await prisma.$transaction(async (tx) => {
    if (!userId) await tx.userAccount.create({ data: { userId: id, loginId: `db${randomUUID().replaceAll('-', '').slice(0, 20)}`, passwordHash: 'test-hash' } });
    await tx.evaluationSession.create({ data: { evaluationId, userId: id, topicCode: 'WORK', startingBandCode: 'BEGINNER', status: 'ANALYSIS_PENDING', createdAt: start, startedAt: start, endedAt: end, endReason: 'USER_ENDED' } });
    for (let i = 0; i < 5; i++) {
      const answerId = randomUUID(); const audioId = randomUUID(); ids.push({ answerId, audioId });
      await tx.audioAsset.create({ data: { audioId, objectKey: `report-test/${audioId}`, mimeType: 'audio/webm', byteSize: 1000n, durationMs: 3000n } });
      await tx.question.create({ data: { questionId: randomUUID(), evaluationId, questionNo: i + 1, content: 'Why do you enjoy working together?', difficultyLevelCode: 'BEGINNER_MID',
        answer: { create: { answerId, audioId, transcript: 'I enjoy sharing ideas and learning from other people.', processingStatus: i === 4 ? 'FAILED' : 'COMPLETED', acceptedAt: start, completedAt: i === 4 ? null : end } },
      } });
    }
  });
  if (!userId) users.push(id); audioIds.push(...ids.map((a) => a.audioId));
  return { userId: id, evaluationId, ids };
}
function assessment(f, level = 'INTERMEDIATE_MID') {
  return { finalLevelCode: level, verdict: 'CONFIRMED', summary: '실제 DB 검증을 위한 평가 결과입니다.', criteria: codes.map((criterionCode) => ({ criterionCode, score: 70, insufficientReason: null, rationale: '실제 답변 근거를 사용했습니다.', evidence: f.ids.slice(0, 3).map((a) => ({ answerId: a.answerId, explanation: '근거 설명' })), feedback: [{ feedbackKind: 'IMPROVEMENT', suggestion: '구체적인 이유를 설명해 보세요.', explanation: '설명 연습' }] })) };
}
function eligible(f) { return Object.fromEntries(codes.map((c) => [c, f.ids.map((a) => a.answerId)])); }
test('PostgreSQL stores five normalized results/evidence once and enforces score, verdict and FK constraints', async () => {
  const f = await fixture(); await repository.claim(f.evaluationId); await repository.save(f.evaluationId, assessment(f), eligible(f)); await repository.save(f.evaluationId, assessment(f), eligible(f));
  const report = await repository.document(f.evaluationId); assert.equal(report.criteria.length, 5); assert.equal(report.criteria[0].evidence.length, 3); assert.equal(typeof report.criteria[0].score, 'number');
  assert.equal((await prisma.evaluationSession.findUnique({ where: { evaluationId: f.evaluationId } })).status, 'COMPLETED');
  const result = await prisma.criterionResult.findFirst({ where: { reportId: report.reportId } });
  await assert.rejects(() => prisma.criterionResult.update({ where: { resultId: result.resultId }, data: { score: 101 } }));
  await assert.rejects(() => prisma.criterionResult.update({ where: { resultId: result.resultId }, data: { insufficientReason: 'contradiction' } }));
  await assert.rejects(() => prisma.evaluationReport.update({ where: { reportId: report.reportId }, data: { finalLevelCode: null } }));
  await assert.rejects(() => prisma.answer.delete({ where: { answerId: f.ids[0].answerId } }));
});
test('foreign evidence is rejected inside the write transaction without a partial report', async () => {
  const own = await fixture(); const foreign = await fixture(); await repository.claim(own.evaluationId);
  const result = assessment(own); result.criteria[0].evidence[0].answerId = foreign.ids[0].answerId;
  const allowed = eligible(own); allowed.VOCABULARY.push(foreign.ids[0].answerId);
  await assert.rejects(() => repository.save(own.evaluationId, result, allowed), (e) => e.code === 'CONFLICT'); assert.equal(await repository.document(own.evaluationId), null);
});
test('failure after inserts rolls back report, all children and COMPLETED together', async () => {
  const f = await fixture(); await repository.claim(f.evaluationId);
  const broken = new PrismaReportRepository({ $transaction: async (run) => prisma.$transaction(async (tx) => { await run(tx); throw new Error('forced commit failure'); }) });
  await assert.rejects(() => broken.save(f.evaluationId, assessment(f), eligible(f))); assert.equal(await repository.document(f.evaluationId), null);
  assert.equal((await prisma.evaluationSession.findUnique({ where: { evaluationId: f.evaluationId } })).status, 'ANALYZING');
});
test('current level is derived from the newest confirmed assessment even when an older one finishes later', async () => {
  const old = await fixture(); const newer = await fixture({ userId: old.userId, offset: 10000 });
  await repository.claim(newer.evaluationId); await repository.save(newer.evaluationId, assessment(newer, 'ADVANCED_LOW'), eligible(newer));
  await repository.claim(old.evaluationId); await repository.save(old.evaluationId, assessment(old, 'BEGINNER_HIGH'), eligible(old));
  const auth = new PrismaAuthRepository(prisma); assert.equal((await auth.findByUserId(old.userId)).currentLevelCode, 'ADVANCED_LOW');
  const provisional = await fixture({ userId: old.userId, offset: 20000 }); await repository.claim(provisional.evaluationId);
  const result = assessment(provisional, 'ADVANCED_HIGH'); Object.assign(result.criteria[2], { score: null, insufficientReason: '부족', evidence: [], feedback: [] }); result.verdict = 'PROVISIONAL';
  await repository.save(provisional.evaluationId, result, eligible(provisional)); assert.equal((await auth.findByUserId(old.userId)).currentLevelCode, 'ADVANCED_LOW');
});
test('late conversation writes cannot alter finalized report inputs and audio requires owned evidence', async () => {
  const f = await fixture(); await repository.claim(f.evaluationId); await repository.save(f.evaluationId, assessment(f), eligible(f));
  const conversation = new PrismaEvaluationRepository(prisma, { maximumDurationSeconds: 600, resumeWindowSeconds: 300 });
  const input = { kind: 'ANSWER', evaluationId: f.evaluationId, ...f.ids[4] };
  assert.equal(await conversation.beginAnswer(input), false); assert.equal(await conversation.saveTranscript(input, 'changed'), false);
  await conversation.completeAnswer(input, new Date()); await conversation.failAnswer(input);
  assert.equal((await prisma.answer.findUnique({ where: { answerId: input.answerId } })).processingStatus, 'FAILED');
  assert.ok(await repository.evidenceAudio(f.userId, f.evaluationId, f.ids[0].answerId)); assert.equal(await repository.evidenceAudio(randomUUID(), f.evaluationId, f.ids[0].answerId), null);
  assert.equal(await repository.evidenceAudio(f.userId, f.evaluationId, f.ids[4].answerId), null);
});
