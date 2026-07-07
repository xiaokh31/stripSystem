-- Persist pallet calculation rule metadata for office review and report/label regeneration.
ALTER TABLE "container_destinations"
  ADD COLUMN "package_type" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
  ADD COLUMN "pallet_rule_code" TEXT,
  ADD COLUMN "calculation_basis_cbm" DECIMAL(12,3),
  ADD COLUMN "rounding_mode" TEXT;

DROP INDEX "container_destinations_container_id_destination_code_destin_key";

CREATE UNIQUE INDEX "container_destinations_container_id_destination_code_destin_key"
  ON "container_destinations"("container_id", "destination_code", "destination_type", "package_type");

CREATE INDEX "container_destinations_pallet_rule_code_idx"
  ON "container_destinations"("pallet_rule_code");
