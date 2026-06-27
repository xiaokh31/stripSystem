import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { WorkerLabelService } from './worker-label.service';

@Module({
  imports: [PrismaModule],
  controllers: [LabelsController],
  providers: [LabelsService, WorkerLabelService],
})
export class LabelsModule {}
