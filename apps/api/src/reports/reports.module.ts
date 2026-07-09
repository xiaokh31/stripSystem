import { Module, forwardRef } from '@nestjs/common';
import { AsyncJobsModule } from '../async-jobs/async-jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryReportsController } from './inventory-reports.controller';
import { InventoryReportsService } from './inventory-reports.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { WorkerReportService } from './worker-report.service';

@Module({
  imports: [PrismaModule, forwardRef(() => AsyncJobsModule)],
  controllers: [ReportsController, InventoryReportsController],
  providers: [ReportsService, WorkerReportService, InventoryReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
