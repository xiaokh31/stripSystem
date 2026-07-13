-- Immutable per-result policy metadata. Existing records retain their persisted final pallet count.
ALTER TABLE "container_destinations"
  ADD COLUMN "pallet_policy_snapshot" JSONB;
