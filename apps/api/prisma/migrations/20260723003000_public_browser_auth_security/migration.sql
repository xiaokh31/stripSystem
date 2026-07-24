-- Reuse the hardened refresh-token family for browser and native delivery while
-- keeping both client contracts distinguishable and independently revocable.
CREATE TYPE "AuthSessionClient" AS ENUM ('BROWSER', 'NATIVE');
CREATE TYPE "AuthAuditEventCode" AS ENUM (
  'BROWSER_LOGIN_SUCCEEDED',
  'BROWSER_LOGIN_FAILED',
  'BROWSER_REFRESH_SUCCEEDED',
  'BROWSER_REFRESH_REUSED',
  'BROWSER_LOGOUT',
  'BROWSER_SESSION_REVOKED',
  'CSRF_REJECTED',
  'AUTH_RATE_LIMITED'
);

ALTER TABLE "native_auth_sessions"
  ADD COLUMN "client_type" "AuthSessionClient" NOT NULL DEFAULT 'NATIVE',
  ADD COLUMN "csrf_token_hash" TEXT,
  ADD COLUMN "user_agent_hash" TEXT,
  ADD COLUMN "created_ip_hash" TEXT;

CREATE INDEX "native_auth_sessions_user_id_client_type_revoked_at_idx"
  ON "native_auth_sessions"("user_id", "client_type", "revoked_at");

CREATE TABLE "auth_audit_events" (
  "id" TEXT NOT NULL,
  "event_code" "AuthAuditEventCode" NOT NULL,
  "session_id" TEXT,
  "user_id" TEXT,
  "actor_user_id" TEXT,
  "client_address_hash" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_audit_events_event_code_created_at_idx"
  ON "auth_audit_events"("event_code", "created_at");
CREATE INDEX "auth_audit_events_session_id_created_at_idx"
  ON "auth_audit_events"("session_id", "created_at");
CREATE INDEX "auth_audit_events_user_id_created_at_idx"
  ON "auth_audit_events"("user_id", "created_at");

ALTER TABLE "auth_audit_events"
  ADD CONSTRAINT "auth_audit_events_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "native_auth_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auth_audit_events"
  ADD CONSTRAINT "auth_audit_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auth_audit_events"
  ADD CONSTRAINT "auth_audit_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
