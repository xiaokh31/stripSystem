ALTER TABLE "native_auth_sessions"
  ADD COLUMN "absolute_expires_at" TIMESTAMP(3),
  ADD COLUMN "revoked_by_user_id" TEXT,
  ADD COLUMN "revoke_reason" TEXT;

UPDATE "native_auth_sessions"
SET "absolute_expires_at" = "expires_at"
WHERE "absolute_expires_at" IS NULL;

ALTER TABLE "native_auth_sessions"
  ALTER COLUMN "absolute_expires_at" SET NOT NULL;

CREATE UNIQUE INDEX "native_auth_sessions_refresh_token_hash_key"
  ON "native_auth_sessions"("refresh_token_hash");

ALTER TABLE "native_auth_sessions"
  ADD CONSTRAINT "native_auth_sessions_revoked_by_user_id_fkey"
  FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "native_refresh_tokens" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "replaced_by_token_hash" TEXT,
  CONSTRAINT "native_refresh_tokens_pkey" PRIMARY KEY ("id")
);

INSERT INTO "native_refresh_tokens" (
  "id", "session_id", "token_hash", "issued_at", "expires_at", "revoked_at"
)
SELECT
  'legacy-current-' || "id",
  "id",
  "refresh_token_hash",
  COALESCE("rotated_at", "created_at"),
  "expires_at",
  "revoked_at"
FROM "native_auth_sessions";

INSERT INTO "native_refresh_tokens" (
  "id", "session_id", "token_hash", "issued_at", "used_at", "expires_at", "revoked_at", "replaced_by_token_hash"
)
SELECT
  'legacy-previous-' || "id",
  "id",
  "previous_refresh_token_hash",
  "created_at",
  COALESCE("rotated_at", "last_used_at"),
  "expires_at",
  "revoked_at",
  "refresh_token_hash"
FROM "native_auth_sessions"
WHERE "previous_refresh_token_hash" IS NOT NULL
  AND "previous_refresh_token_hash" <> "refresh_token_hash";

CREATE UNIQUE INDEX "native_refresh_tokens_token_hash_key"
  ON "native_refresh_tokens"("token_hash");
CREATE INDEX "native_refresh_tokens_session_id_issued_at_idx"
  ON "native_refresh_tokens"("session_id", "issued_at");
CREATE INDEX "native_refresh_tokens_expires_at_idx"
  ON "native_refresh_tokens"("expires_at");

ALTER TABLE "native_refresh_tokens"
  ADD CONSTRAINT "native_refresh_tokens_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "native_auth_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
