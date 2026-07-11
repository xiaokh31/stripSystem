ALTER TYPE "PalletStatus" ADD VALUE IF NOT EXISTS 'ADJUSTED_OUT';
ALTER TYPE "PalletEventType" ADD VALUE IF NOT EXISTS 'MANUAL_INVENTORY_DEPLETION';

CREATE TYPE "InventoryAdjustmentType" AS ENUM ('MANUAL_DEPLETION');
CREATE TYPE "InventoryAdjustmentReasonCode" AS ENUM (
  'DELIVERED_WITHOUT_SCAN',
  'SCAN_MISSED',
  'DATA_CLEANUP',
  'OTHER'
);

CREATE TABLE "inventory_adjustments" (
  "id" TEXT NOT NULL,
  "container_id" TEXT NOT NULL,
  "container_destination_id" TEXT NOT NULL,
  "adjustment_type" "InventoryAdjustmentType" NOT NULL DEFAULT 'MANUAL_DEPLETION',
  "pallet_count" INTEGER NOT NULL,
  "reason_code" "InventoryAdjustmentReasonCode" NOT NULL,
  "note" TEXT,
  "metadata" JSONB,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pallet_events" ADD COLUMN "inventory_adjustment_id" TEXT;

CREATE INDEX "inventory_adjustments_container_id_idx" ON "inventory_adjustments"("container_id");
CREATE INDEX "inventory_adjustments_container_destination_id_idx" ON "inventory_adjustments"("container_destination_id");
CREATE INDEX "inventory_adjustments_adjustment_type_idx" ON "inventory_adjustments"("adjustment_type");
CREATE INDEX "inventory_adjustments_reason_code_idx" ON "inventory_adjustments"("reason_code");
CREATE INDEX "inventory_adjustments_created_by_id_idx" ON "inventory_adjustments"("created_by_id");
CREATE INDEX "inventory_adjustments_created_at_idx" ON "inventory_adjustments"("created_at");
CREATE INDEX "pallet_events_inventory_adjustment_id_idx" ON "pallet_events"("inventory_adjustment_id");

ALTER TABLE "inventory_adjustments"
  ADD CONSTRAINT "inventory_adjustments_container_id_fkey"
  FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_adjustments"
  ADD CONSTRAINT "inventory_adjustments_container_destination_id_fkey"
  FOREIGN KEY ("container_destination_id") REFERENCES "container_destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_adjustments"
  ADD CONSTRAINT "inventory_adjustments_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pallet_events"
  ADD CONSTRAINT "pallet_events_inventory_adjustment_id_fkey"
  FOREIGN KEY ("inventory_adjustment_id") REFERENCES "inventory_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
