import { Global, Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AsyncJobsController } from './async-jobs.controller';
import { AsyncJobsProcessor } from './async-jobs.processor';
import { AsyncJobsService } from './async-jobs.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { ImportsModule } from '../imports/imports.module';
import { LabelsModule } from '../labels/labels.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { ParserLearningCasesModule } from '../parser-learning-cases/parser-learning-cases.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    forwardRef(() => ImportsModule),
    forwardRef(() => ReportsModule),
    forwardRef(() => LabelsModule),
    forwardRef(() => AttendanceModule),
    forwardRef(() => ParserLearningCasesModule),
  ],
  controllers: [AsyncJobsController],
  providers: [AsyncJobsService, AsyncJobsProcessor],
  exports: [AsyncJobsService],
})
export class AsyncJobsModule {}
