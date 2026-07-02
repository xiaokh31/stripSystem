CREATE TABLE "operational_settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "operational_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_settings_key_key" ON "operational_settings"("key");
CREATE INDEX "operational_settings_updated_by_id_idx" ON "operational_settings"("updated_by_id");

ALTER TABLE "operational_settings"
  ADD CONSTRAINT "operational_settings_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
