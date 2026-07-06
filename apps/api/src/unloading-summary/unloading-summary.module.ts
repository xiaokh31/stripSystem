import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UnloadingSummaryController } from './unloading-summary.controller';
import { UnloadingSummaryService } from './unloading-summary.service';
import { WorkerUnloadingSummaryService } from './worker-unloading-summary.service';

@Module({
  imports: [PrismaModule],
  controllers: [UnloadingSummaryController],
  providers: [UnloadingSummaryService, WorkerUnloadingSummaryService],
})
export class UnloadingSummaryModule {}
