CREATE TYPE "account_state" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "proficiency_level_code" AS ENUM (
  'BEGINNER_LOW', 'BEGINNER_MID', 'BEGINNER_HIGH',
  'INTERMEDIATE_LOW', 'INTERMEDIATE_MID', 'INTERMEDIATE_HIGH',
  'ADVANCED_LOW', 'ADVANCED_MID', 'ADVANCED_HIGH'
);

CREATE TABLE "user_account" (
  "user_id" UUID NOT NULL,
  "login_id" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "account_status" "account_state" NOT NULL DEFAULT 'ACTIVE',
  "current_level_code" "proficiency_level_code",
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_account_pkey" PRIMARY KEY ("user_id")
);

CREATE UNIQUE INDEX "user_account_login_id_key" ON "user_account"("login_id");

CREATE TABLE "refresh_token" (
  "token_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("token_id"),
  CONSTRAINT "refresh_token_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "refresh_token_revocation_check" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at"),
  CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");
