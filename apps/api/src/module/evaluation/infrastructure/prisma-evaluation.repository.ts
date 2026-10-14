import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, Prisma } from '@root/database';
import { PRISMA_CLIENT } from '../../../database/database.module';
import type { EvaluationRepository } from '../application/evaluation.ports';
import type { AnswerSnapshot, AudioMetadata, CreateEvaluation, EndReason, LevelCode, SessionSnapshot, SubmitAnswer, TopicCode, TurnJob } from '../application/evaluation.contracts';
import { EvaluationError } from '../domain/evaluation-error';
import { expiry, EvaluationSession } from '../domain/evaluation-session';
import { EvaluationConfig } from './evaluation-config';

type Transaction = Prisma.TransactionClient;
type AnswerInput = Extract<TurnJob, { kind: 'ANSWER' }>;
const include = { questions: { orderBy: { questionNo: 'asc' }, include: { answer: { include: { audio: true } } } }, user: { select: { accountStatus: true } } } satisfies Prisma.EvaluationSessionInclude;
type Row = Prisma.EvaluationSessionGetPayload<{ include: typeof include }>;
function audioSnapshot(row: { audioId: string; objectKey: string; mimeType: string; byteSize: bigint; durationMs: bigint }): AudioMetadata {
  return { audioId: row.audioId, objectKey: row.objectKey, mimeType: row.mimeType, byteSize: Number(row.byteSize), durationMs: Number(row.durationMs) };
}
function snapshot(row: Row): SessionSnapshot {
  const questions = row.questions.map((q) => ({ questionId: q.questionId, questionNo: q.questionNo, content: q.content, difficultyLevelCode: q.difficultyLevelCode, audioId: q.audioId,
    answer: q.answer ? { answerId: q.answer.answerId, questionId: q.questionId, audio: audioSnapshot(q.answer.audio), transcript: q.answer.transcript, processingStatus: q.answer.processingStatus, acceptedAt: q.answer.acceptedAt } : null }));
  return { evaluationId: row.evaluationId, userId: row.userId, topicCode: row.topicCode as TopicCode, startingBandCode: row.startingBandCode,
    status: row.status, createdAt: row.createdAt, startedAt: row.startedAt, pausedAt: row.pausedAt, endedAt: row.endedAt, endReason: row.endReason,
    questions, question: questions.at(-1) ?? null, latestAnswer: questions.flatMap((q) => q.answer ? [q.answer] : []).at(-1) ?? null };
}
async function locked(tx: Transaction, evaluationId: string): Promise<Row> {
  await tx.$queryRaw`SELECT evaluation_id FROM evaluation_session WHERE evaluation_id = ${evaluationId}::uuid FOR UPDATE`;
  const row = await tx.evaluationSession.findUnique({ where: { evaluationId }, include });
  if (!row) throw new EvaluationError('NOT_FOUND', '평가를 찾을 수 없습니다.');
  if (row.user.accountStatus !== 'ACTIVE') throw new EvaluationError('UNAUTHORIZED', '인증에 실패했습니다.');
  return row;
}
function matching(row: Row, input: AnswerInput) {
  return row.questions.find((q) => q.answer?.answerId === input.answerId && q.answer.audioId === input.audioId)?.answer ?? null;
}
async function finishEnding(tx: Transaction, row: Row) {
  if (row.status !== 'ENDING') return;
  const pending = await tx.answer.count({ where: { question: { evaluationId: row.evaluationId }, processingStatus: { in: ['PENDING', 'PROCESSING'] } } });
  if (!pending) await tx.evaluationSession.update({ where: { evaluationId: row.evaluationId }, data: { status: 'ANALYSIS_PENDING' } });
}
@Injectable()
export class PrismaEvaluationRepository implements EvaluationRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient, private readonly config: EvaluationConfig) {}
  async create(input: CreateEvaluation & { userId: string }) {
    await this.prisma.evaluationSession.upsert({ where: { evaluationId: input.evaluationId }, create: input, update: {} });
    return (await this.find(input.evaluationId))!;
  }
  async find(evaluationId: string) {
    const row = await this.prisma.evaluationSession.findUnique({ where: { evaluationId }, include });
    return row ? snapshot(row) : null;
  }
  async resumable(userId: string) {
    return (await this.prisma.evaluationSession.findMany({ where: { userId, status: 'PAUSED' }, orderBy: { pausedAt: 'desc' }, select: { evaluationId: true } })).map((r) => r.evaluationId);
  }
  async saveQuestion(evaluationId: string, content: string, difficulty: LevelCode, input?: AnswerInput) {
    return this.prisma.$transaction(async (tx) => {
      const row = await locked(tx, evaluationId);
      if (input && (!matching(row, input) || !['IN_PROGRESS', 'PAUSED'].includes(row.status))) return null;
      if (!input && row.status !== 'READY') return null;
      const source = input ? row.questions.find((q) => q.answer?.answerId === input.answerId) : null;
      const no = source ? source.questionNo + 1 : 1;
      const existing = row.questions.find((q) => q.questionNo === no);
      if (existing) return snapshot(row).questions.find((q) => q.questionId === existing.questionId)!;
      const question = await tx.question.create({ data: { evaluationId, questionNo: no, content, difficultyLevelCode: difficulty } });
      return { ...question, answer: null };
    });
  }
  async completeQuestion(evaluationId: string, questionId: string, audio: AudioMetadata, now: Date, input?: AnswerInput) {
    return this.prisma.$transaction(async (tx) => {
      const row = await locked(tx, evaluationId);
      if (input && (!matching(row, input) || !['IN_PROGRESS', 'PAUSED'].includes(row.status))) return false;
      if (!input && row.status !== 'READY') return false;
      if (row.startedAt && expiry(snapshot(row), now, this.config.maximumDurationSeconds, this.config.resumeWindowSeconds)) return false;
      const q = row.questions.find((q) => q.questionId === questionId);
      if (!q || q.audioId) return false;
      await tx.audioAsset.create({ data: { ...audio, byteSize: BigInt(audio.byteSize), durationMs: BigInt(audio.durationMs) } });
      await tx.question.update({ where: { questionId }, data: { audioId: audio.audioId } });
      if (!input) await tx.evaluationSession.update({ where: { evaluationId }, data: { status: 'IN_PROGRESS', startedAt: now } });
      else await tx.answer.update({ where: { answerId: input.answerId }, data: { processingStatus: 'COMPLETED', completedAt: now } });
      return true;
    });
  }
  async acceptAnswer(userId: string, input: SubmitAnswer, answerId: string, audio: AudioMetadata, now: Date, replace: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const row = await locked(tx, input.evaluationId);
      EvaluationSession.restore(snapshot(row)).assertCanAcceptAnswer(userId, input.questionId, now, this.config.maximumDurationSeconds, this.config.resumeWindowSeconds);
      const q = row.questions.at(-1);
      if (!q || q.questionId !== input.questionId || !q.audioId) throw new EvaluationError('CONFLICT', '현재 질문에만 답변할 수 있습니다.');
      if (q.answer && !(replace && q.answer.processingStatus === 'FAILED' && !q.answer.transcript)) return { accepted: false, answer: snapshot(row).latestAnswer!, oldAudio: null };
      await tx.audioAsset.create({ data: { audioId: audio.audioId, objectKey: audio.objectKey, mimeType: audio.mimeType, byteSize: BigInt(audio.byteSize), durationMs: BigInt(audio.durationMs) } });
      const data = { audioId: audio.audioId, processingStatus: 'PENDING' as const, acceptedAt: now, completedAt: null, transcript: null };
      const answer = q.answer ? await tx.answer.update({ where: { answerId: q.answer.answerId }, data }) : await tx.answer.create({ data: { answerId, questionId: q.questionId, ...data } });
      if (q.answer) await tx.audioAsset.delete({ where: { audioId: q.answer.audioId } });
      return { accepted: true, answer: { ...answer, audio } satisfies AnswerSnapshot, oldAudio: q.answer ? audioSnapshot(q.answer.audio) : null };
    });
  }
  async beginAnswer(input: AnswerInput) {
    return this.prisma.$transaction(async (tx) => {
      const row = await locked(tx, input.evaluationId); const answer = matching(row, input);
      if (!answer || answer.processingStatus === 'COMPLETED' || !['IN_PROGRESS', 'PAUSED', 'ENDING'].includes(row.status)) return false;
      await tx.answer.update({ where: { answerId: answer.answerId }, data: { processingStatus: 'PROCESSING' } }); return true;
    });
  }
  async saveTranscript(input: AnswerInput, text: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await locked(tx, input.evaluationId); const answer = matching(row, input);
      if (!answer || !['IN_PROGRESS', 'PAUSED', 'ENDING'].includes(row.status)) return false;
      if (!answer.transcript) await tx.answer.update({ where: { answerId: answer.answerId }, data: { transcript: text } }); return true;
    });
  }
  async completeAnswer(input: AnswerInput, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      const row = await locked(tx, input.evaluationId); const answer = matching(row, input);
      if (!answer || !answer.transcript || answer.processingStatus === 'COMPLETED' || !['IN_PROGRESS', 'PAUSED', 'ENDING'].includes(row.status)) return;
      await tx.answer.update({ where: { answerId: answer.answerId }, data: { processingStatus: 'COMPLETED', completedAt: now } });
      await finishEnding(tx, row);
    });
  }
  async failAnswer(input: AnswerInput) {
    await this.prisma.$transaction(async (tx) => {
      const row = await locked(tx, input.evaluationId); const answer = matching(row, input);
      if (!answer || answer.processingStatus === 'COMPLETED' || !['IN_PROGRESS', 'PAUSED', 'ENDING'].includes(row.status)) return;
      await tx.answer.update({ where: { answerId: answer.answerId }, data: { processingStatus: 'FAILED' } });
      await finishEnding(tx, row);
    });
  }
  async pause(evaluationId: string, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      const row = await locked(tx, evaluationId);
      EvaluationSession.restore(snapshot(row)).assertCanPause(now, this.config.maximumDurationSeconds, this.config.resumeWindowSeconds);
      if (row.status === 'PAUSED') return;
      await tx.evaluationSession.update({ where: { evaluationId }, data: { status: 'PAUSED', pausedAt: now } });
    });
  }
  async resume(evaluationId: string, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      const row = await locked(tx, evaluationId);
      EvaluationSession.restore(snapshot(row)).assertCanResume(now, this.config.maximumDurationSeconds, this.config.resumeWindowSeconds);
      await tx.evaluationSession.update({ where: { evaluationId }, data: { status: 'IN_PROGRESS', pausedAt: null } });
    });
  }
  async end(evaluationId: string, reason: EndReason, now: Date, expectedPausedAt?: string) {
    await this.prisma.$transaction(async (tx) => {
      const row = await locked(tx, evaluationId);
      if (expectedPausedAt && (row.status !== 'PAUSED' || row.pausedAt?.toISOString() !== expectedPausedAt)) return;
      if (!['IN_PROGRESS', 'PAUSED'].includes(row.status)) return;
      const ending = await tx.evaluationSession.update({ where: { evaluationId }, data: { status: 'ENDING', endedAt: now, endReason: reason, pausedAt: null }, include });
      await finishEnding(tx, ending);
    });
  }
  async findQuestionAudio(userId: string, audioId: string) {
    const q = await this.prisma.question.findFirst({ where: { audioId, answer: null, evaluation: { userId, status: 'IN_PROGRESS', user: { accountStatus: 'ACTIVE' } } }, include: { audio: true, evaluation: { select: { startedAt: true, questions: { orderBy: { questionNo: 'desc' }, take: 1, select: { questionId: true } } } } } });
    if (!q?.audio || q.evaluation.questions[0]?.questionId !== q.questionId || !q.evaluation.startedAt || Date.now() >= q.evaluation.startedAt.getTime() + this.config.maximumDurationSeconds * 1000) return null;
    return audioSnapshot(q.audio);
  }
}
