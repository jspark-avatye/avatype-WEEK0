-- Existing authentication has never written an assessed level. Do not discard
-- an unexpected legacy value without a source report.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM user_account WHERE current_level_code IS NOT NULL) THEN
    RAISE EXCEPTION 'Report migration requires legacy current_level_code values to be NULL';
  END IF;
END $$;
ALTER TABLE "user_account" DROP COLUMN "current_level_code";
CREATE TYPE "evaluation_verdict" AS ENUM ('CONFIRMED', 'PROVISIONAL', 'UNASSESSABLE');
CREATE TYPE "assessment_criterion_code" AS ENUM ('VOCABULARY', 'GRAMMAR', 'PRONUNCIATION', 'FLUENCY', 'RELEVANCE');
CREATE TYPE "feedback_kind" AS ENUM ('IMPROVEMENT', 'EXPRESSION_CORRECTION');
CREATE TABLE "evaluation_report" (
  "report_id" UUID NOT NULL,
  "evaluation_id" UUID NOT NULL,
  "final_level_code" "proficiency_level_code",
  "verdict" "evaluation_verdict" NOT NULL,
  "summary" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluation_report_pkey" PRIMARY KEY ("report_id"),
  CONSTRAINT "report_level_verdict" CHECK ((verdict = 'UNASSESSABLE') = (final_level_code IS NULL)),
  CONSTRAINT "report_summary_nonempty" CHECK (length(btrim(summary)) > 0),
  CONSTRAINT "evaluation_report_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluation_session"("evaluation_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "evaluation_report_evaluation_id_key" ON "evaluation_report"("evaluation_id");
CREATE TABLE "criterion_result" (
  "result_id" UUID NOT NULL,
  "report_id" UUID NOT NULL,
  "criterion_code" "assessment_criterion_code" NOT NULL,
  "score" NUMERIC(8,3),
  "insufficient_reason" TEXT,
  "rationale" TEXT NOT NULL,
  CONSTRAINT "criterion_result_pkey" PRIMARY KEY ("result_id"),
  CONSTRAINT "criterion_score_range" CHECK (score IS NULL OR (score BETWEEN 0 AND 100 AND score = trunc(score))),
  CONSTRAINT "criterion_score_reason" CHECK ((score IS NOT NULL) <> (insufficient_reason IS NOT NULL)),
  CONSTRAINT "criterion_reason_nonempty" CHECK (insufficient_reason IS NULL OR length(btrim(insufficient_reason)) > 0),
  CONSTRAINT "criterion_rationale_nonempty" CHECK (length(btrim(rationale)) > 0),
  CONSTRAINT "criterion_result_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "evaluation_report"("report_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "criterion_result_report_id_criterion_code_key" ON "criterion_result"("report_id", "criterion_code");
CREATE TABLE "criterion_feedback" (
  "feedback_id" UUID NOT NULL,
  "result_id" UUID NOT NULL,
  "feedback_no" INTEGER NOT NULL,
  "feedback_kind" "feedback_kind" NOT NULL,
  "suggestion" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  CONSTRAINT "criterion_feedback_pkey" PRIMARY KEY ("feedback_id"),
  CONSTRAINT "feedback_order_positive" CHECK (feedback_no BETWEEN 1 AND 3),
  CONSTRAINT "feedback_text_nonempty" CHECK (length(btrim(suggestion)) > 0 AND length(btrim(explanation)) > 0),
  CONSTRAINT "criterion_feedback_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "criterion_result"("result_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "criterion_feedback_result_id_feedback_no_key" ON "criterion_feedback"("result_id", "feedback_no");
CREATE TABLE "criterion_evidence" (
  "result_id" UUID NOT NULL,
  "answer_id" UUID NOT NULL,
  "evidence_no" INTEGER NOT NULL,
  "explanation" TEXT NOT NULL,
  CONSTRAINT "criterion_evidence_pkey" PRIMARY KEY ("result_id", "answer_id"),
  CONSTRAINT "evidence_order_positive" CHECK (evidence_no BETWEEN 1 AND 3),
  CONSTRAINT "evidence_text_nonempty" CHECK (length(btrim(explanation)) > 0),
  CONSTRAINT "criterion_evidence_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "criterion_result"("result_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "criterion_evidence_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "answer"("answer_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "criterion_evidence_result_id_evidence_no_key" ON "criterion_evidence"("result_id", "evidence_no");
CREATE INDEX "criterion_evidence_answer_id_idx" ON "criterion_evidence"("answer_id");
COMMIT;
