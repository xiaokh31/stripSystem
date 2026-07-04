-- AlterTable
ALTER TABLE "correction_feedback" ADD COLUMN     "attendance_import_id" TEXT,
ADD COLUMN     "pay_container_id" TEXT,
ADD COLUMN     "unloading_wage_settlement_id" TEXT;

-- CreateIndex
CREATE INDEX "correction_feedback_attendance_import_id_idx" ON "correction_feedback"("attendance_import_id");

-- CreateIndex
CREATE INDEX "correction_feedback_pay_container_id_idx" ON "correction_feedback"("pay_container_id");

-- CreateIndex
CREATE INDEX "correction_feedback_unloading_wage_settlement_id_idx" ON "correction_feedback"("unloading_wage_settlement_id");

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_attendance_import_id_fkey" FOREIGN KEY ("attendance_import_id") REFERENCES "attendance_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_pay_container_id_fkey" FOREIGN KEY ("pay_container_id") REFERENCES "pay_containers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_unloading_wage_settlement_id_fkey" FOREIGN KEY ("unloading_wage_settlement_id") REFERENCES "unloading_wage_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
