import { Module, forwardRef } from '@nestjs/common';
import { AsyncJobsModule } from '../async-jobs/async-jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { WorkerLabelService } from './worker-label.service';

@Module({
  imports: [PrismaModule, forwardRef(() => AsyncJobsModule)],
  controllers: [LabelsController],
  providers: [LabelsService, WorkerLabelService],
  exports: [LabelsService],
})
export class LabelsModule {}
