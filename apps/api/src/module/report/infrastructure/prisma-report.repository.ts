import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, Prisma } from '@root/database';
import { PRISMA_CLIENT } from '../../../database/database.module';
import type { ReportRepository } from '../application/report.ports';
import { criteria, type EvaluationHistory, type HistoryInput, type ReportDocument, type ReportSource, type ValidatedAssessment } from '../application/report.contracts';
import { ReportError } from '../domain/report-error';
import { parseAssessment } from '../domain/report-policy';

const sourceInclude = { questions: { orderBy: { questionNo: 'asc' }, include: { answer: { include: { audio: true } } } } } satisfies Prisma.EvaluationSessionInclude;
const reportInclude = { criteria: { include: {
  feedback: { orderBy: { feedbackNo: 'asc' } },
  evidence: { orderBy: { evidenceNo: 'asc' }, include: { answer: { include: { question: true, audio: true } } } },
} } } satisfies Prisma.EvaluationReportInclude;
function document(row: Prisma.EvaluationReportGetPayload<{ include: typeof reportInclude }>): ReportDocument {
  return { reportId: row.reportId, evaluationId: row.evaluationId, finalLevelCode: row.finalLevelCode, verdict: row.verdict, summary: row.summary, createdAt: row.createdAt.toISOString(),
    criteria: criteria.map((code) => {
      const c = row.criteria.find((c) => c.criterionCode === code);
      if (!c) throw new ReportError('INTERNAL_SERVER_ERROR', '보고서 항목을 확인할 수 없습니다.');
      return { criterionCode: c.criterionCode, score: c.score === null ? null : Number(c.score), insufficientReason: c.insufficientReason, rationale: c.rationale,
        feedback: c.feedback.map((f) => ({ feedbackKind: f.feedbackKind, suggestion: f.suggestion, explanation: f.explanation })),
        evidence: c.evidence.map((e) => ({ answerId: e.answerId, explanation: e.explanation, questionId: e.answer.questionId,
          question: e.answer.question.content, transcript: e.answer.transcript ?? '', durationMs: Number(e.answer.audio.durationMs) })),
      };
    }),
  };
}
async function lock(tx: Prisma.TransactionClient, evaluationId: string) {
  await tx.$queryRaw`SELECT evaluation_id FROM evaluation_session WHERE evaluation_id = ${evaluationId}::uuid FOR UPDATE`;
  const row = await tx.evaluationSession.findUnique({ where: { evaluationId }, include: { ...sourceInclude, report: true, user: { select: { accountStatus: true } } } });
  if (!row) throw new ReportError('NOT_FOUND', '평가를 찾을 수 없습니다.');
  if (row.user.accountStatus !== 'ACTIVE') throw new ReportError('UNAUTHORIZED', '인증에 실패했습니다.');
  return row;
}
@Injectable()
export class PrismaReportRepository implements ReportRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}
  async source(evaluationId: string): Promise<ReportSource | null> {
    const row = await this.prisma.evaluationSession.findUnique({ where: { evaluationId }, include: sourceInclude });
    return row ? { evaluationId, userId: row.userId, status: row.status, topicCode: row.topicCode, endReason: row.endReason,
      answers: row.questions.flatMap((q) => q.answer ? [{ answerId: q.answer.answerId, questionId: q.questionId, question: q.content,
        transcript: q.answer.transcript, processingStatus: q.answer.processingStatus, objectKey: q.answer.audio.objectKey, mimeType: q.answer.audio.mimeType, durationMs: Number(q.answer.audio.durationMs) }] : []),
    } : null;
  }
  async document(evaluationId: string) {
    const row = await this.prisma.evaluationReport.findUnique({ where: { evaluationId }, include: reportInclude });
    return row ? document(row) : null;
  }
  async claim(evaluationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await lock(tx, evaluationId);
      if (row.report || !['ANALYSIS_PENDING', 'ANALYZING'].includes(row.status)) return false;
      if (row.questions.some((q) => q.answer && ['PENDING', 'PROCESSING'].includes(q.answer.processingStatus))) throw new ReportError('CONFLICT', '답변 처리가 아직 끝나지 않았습니다.');
      await tx.evaluationSession.update({ where: { evaluationId }, data: { status: 'ANALYZING' } }); return true;
    });
  }
  async fail(evaluationId: string) {
    await this.prisma.evaluationSession.updateMany({ where: { evaluationId, status: { in: ['ANALYZING', 'ANALYSIS_PENDING'] }, report: { is: null } }, data: { status: 'ANALYSIS_FAILED' } });
  }
  async prepareRetry(evaluationId: string) {
    const updated = await this.prisma.evaluationSession.updateMany({ where: { evaluationId, status: 'ANALYSIS_FAILED', report: { is: null } }, data: { status: 'ANALYSIS_PENDING' } });
    return updated.count === 1;
  }
  async restoreFailure(evaluationId: string) {
    await this.prisma.evaluationSession.updateMany({ where: { evaluationId, status: 'ANALYSIS_PENDING', report: { is: null } }, data: { status: 'ANALYSIS_FAILED' } });
  }
  async save(evaluationId: string, result: ValidatedAssessment, eligible: Record<string, string[]>) {
    const parsed = parseAssessment(result);
    const verdict = parsed.finalLevelCode === null ? 'UNASSESSABLE' : (eligible.VOCABULARY?.length ?? 0) >= 5 && parsed.criteria.every((c) => c.score !== null) ? 'CONFIRMED' : 'PROVISIONAL';
    if (verdict !== result.verdict) throw new ReportError('CONFLICT', '보고서 판정 조건이 올바르지 않습니다.');
    await this.prisma.$transaction(async (tx) => {
      const row = await lock(tx, evaluationId);
      if (row.report) return;
      if (row.status !== 'ANALYZING' || row.questions.some((q) => q.answer && ['PENDING', 'PROCESSING'].includes(q.answer.processingStatus))) throw new ReportError('CONFLICT', '보고서를 저장할 수 없는 평가 상태입니다.');
      const answers = row.questions.flatMap((q) => q.answer?.transcript ? [q.answer.answerId] : []);
      for (const c of parsed.criteria) {
        if (c.evidence.some((e) => !answers.includes(e.answerId) || !eligible[c.criterionCode]?.includes(e.answerId))) throw new ReportError('CONFLICT', '평가 근거가 해당 답변을 참조하지 않습니다.');
      }
      await tx.evaluationReport.create({ data: { evaluationId, finalLevelCode: parsed.finalLevelCode, verdict, summary: parsed.summary,
        criteria: { create: parsed.criteria.map((c) => ({ criterionCode: c.criterionCode, score: c.score, insufficientReason: c.insufficientReason, rationale: c.rationale,
          feedback: { create: c.feedback.map((f, index) => ({ ...f, feedbackNo: index + 1 })) },
          evidence: { create: c.evidence.map((e, index) => ({ ...e, evidenceNo: index + 1 })) },
        })) },
      } });
      await tx.evaluationSession.update({ where: { evaluationId }, data: { status: 'COMPLETED' } });
    });
  }
  async history(userId: string, input: HistoryInput): Promise<EvaluationHistory> {
    const [total, rows] = await Promise.all([
      this.prisma.evaluationSession.count({ where: { userId } }),
      this.prisma.evaluationSession.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { evaluationId: 'desc' }],
        skip: (input.page - 1) * input.pageSize, take: input.pageSize, include: { report: { select: { finalLevelCode: true, verdict: true } } },
      }),
    ]);
    return { ...input, total, items: rows.map((row) => ({ evaluationId: row.evaluationId, topicCode: row.topicCode, status: row.status, createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null, finalLevelCode: row.report?.finalLevelCode ?? null, verdict: row.report?.verdict ?? null })) };
  }
  async evidenceAudio(userId: string, evaluationId: string, answerId: string) {
    const link = await this.prisma.criterionEvidence.findFirst({ where: { answerId,
      result: { report: { evaluationId, evaluation: { userId, status: 'COMPLETED', user: { accountStatus: 'ACTIVE' } } } },
    }, include: { answer: { include: { audio: true } } } });
    return link ? { objectKey: link.answer.audio.objectKey, mimeType: link.answer.audio.mimeType } : null;
  }
}
