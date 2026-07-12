CREATE TABLE "native_auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "platform" TEXT,
    "app_version" TEXT,
    "refresh_token_hash" TEXT NOT NULL,
    "previous_refresh_token_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "native_auth_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "native_auth_sessions" ADD CONSTRAINT "native_auth_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "native_auth_sessions_user_id_revoked_at_idx" ON "native_auth_sessions"("user_id", "revoked_at");
CREATE INDEX "native_auth_sessions_expires_at_idx" ON "native_auth_sessions"("expires_at");
