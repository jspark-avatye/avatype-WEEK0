CREATE TYPE "answer_processing_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "evaluation_end_reason" AS ENUM ('USER_ENDED', 'TIME_LIMIT', 'PAUSE_EXPIRED', 'SUFFICIENT_EVIDENCE');
ALTER TABLE "evaluation_session" ADD COLUMN "end_reason" "evaluation_end_reason";
ALTER TABLE "evaluation_session" ADD CONSTRAINT "session_end_reason_time" CHECK ((ended_at IS NULL) = (end_reason IS NULL));
ALTER TABLE "evaluation_session" ADD CONSTRAINT "session_end_status" CHECK (
  (status IN ('ENDING', 'ANALYSIS_PENDING', 'ANALYZING', 'COMPLETED', 'ANALYSIS_FAILED')) = (ended_at IS NOT NULL)
);
ALTER TABLE "evaluation_session" ADD CONSTRAINT "session_started_state" CHECK ((status = 'READY') = (started_at IS NULL));
ALTER TABLE "evaluation_session" ADD CONSTRAINT "session_paused_time" CHECK (paused_at IS NULL OR (started_at IS NOT NULL AND paused_at >= started_at));
CREATE TABLE "answer" (
  "answer_id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "audio_id" UUID NOT NULL,
  "transcript" TEXT,
  "processing_status" "answer_processing_status" NOT NULL DEFAULT 'PENDING',
  "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "answer_pkey" PRIMARY KEY ("answer_id"),
  CONSTRAINT "answer_completed_text" CHECK (processing_status <> 'COMPLETED' OR (transcript IS NOT NULL AND length(btrim(transcript)) > 0)),
  CONSTRAINT "answer_completed_time" CHECK ((processing_status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CONSTRAINT "answer_time_order" CHECK (completed_at IS NULL OR completed_at >= accepted_at),
  CONSTRAINT "answer_nonempty_text" CHECK (transcript IS NULL OR length(btrim(transcript)) > 0)
);
CREATE UNIQUE INDEX "answer_question_id_key" ON "answer"("question_id");
CREATE UNIQUE INDEX "answer_audio_id_key" ON "answer"("audio_id");
ALTER TABLE "answer" ADD CONSTRAINT "answer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("question_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "answer" ADD CONSTRAINT "answer_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "audio_asset"("audio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
