-- CreateTable
CREATE TABLE "unloading_workers" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "worker_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unloading_workers_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "unloader_assignments"
ADD COLUMN "unloading_worker_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "unloading_workers_worker_code_key" ON "unloading_workers"("worker_code");

-- CreateIndex
CREATE INDEX "unloading_workers_is_active_idx" ON "unloading_workers"("is_active");

-- CreateIndex
CREATE INDEX "unloading_workers_display_name_idx" ON "unloading_workers"("display_name");

-- CreateIndex
CREATE INDEX "unloading_workers_created_by_id_idx" ON "unloading_workers"("created_by_id");

-- CreateIndex
CREATE INDEX "unloading_workers_updated_by_id_idx" ON "unloading_workers"("updated_by_id");

-- CreateIndex
CREATE INDEX "unloader_assignments_unloading_worker_id_idx" ON "unloader_assignments"("unloading_worker_id");

-- AddForeignKey
ALTER TABLE "unloading_workers"
ADD CONSTRAINT "unloading_workers_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unloading_workers"
ADD CONSTRAINT "unloading_workers_updated_by_id_fkey"
FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unloader_assignments"
ADD CONSTRAINT "unloader_assignments_unloading_worker_id_fkey"
FOREIGN KEY ("unloading_worker_id") REFERENCES "unloading_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
