CREATE TYPE "proficiency_band_code" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "evaluation_status" AS ENUM ('READY', 'IN_PROGRESS', 'PAUSED', 'ENDING', 'ANALYSIS_PENDING', 'ANALYZING', 'COMPLETED', 'ANALYSIS_FAILED');

CREATE TABLE "evaluation_session" (
  "evaluation_id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "topic_code" TEXT NOT NULL,
  "starting_band_code" "proficiency_band_code" NOT NULL,
  "status" "evaluation_status" NOT NULL DEFAULT 'READY',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(6),
  "paused_at" TIMESTAMPTZ(6),
  "ended_at" TIMESTAMPTZ(6),
  CONSTRAINT "session_started_time" CHECK ("started_at" IS NULL OR "started_at" >= "created_at"),
  CONSTRAINT "session_ended_time" CHECK ("ended_at" IS NULL OR ("started_at" IS NOT NULL AND "ended_at" >= "started_at")),
  CONSTRAINT "session_paused_state" CHECK (("status" = 'PAUSED') = ("paused_at" IS NOT NULL)),
  CONSTRAINT "session_topic_not_empty" CHECK (length("topic_code") > 0)
);
CREATE INDEX "evaluation_session_user_id_idx" ON "evaluation_session"("user_id");

CREATE TABLE "audio_asset" (
  "audio_id" UUID PRIMARY KEY,
  "object_key" TEXT NOT NULL UNIQUE,
  "mime_type" TEXT NOT NULL,
  "byte_size" BIGINT NOT NULL CHECK ("byte_size" > 0),
  "duration_ms" BIGINT NOT NULL CHECK ("duration_ms" > 0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "question" (
  "question_id" UUID PRIMARY KEY,
  "evaluation_id" UUID NOT NULL REFERENCES "evaluation_session"("evaluation_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "question_no" INTEGER NOT NULL CHECK ("question_no" > 0),
  "content" TEXT NOT NULL CHECK (length(trim("content")) > 0),
  "difficulty_level_code" "proficiency_level_code" NOT NULL,
  "audio_id" UUID UNIQUE REFERENCES "audio_asset"("audio_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("evaluation_id", "question_no")
);
