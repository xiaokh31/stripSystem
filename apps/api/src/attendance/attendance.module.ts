import { Module, forwardRef } from '@nestjs/common';
import { AsyncJobsModule } from '../async-jobs/async-jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { WorkerAttendanceService } from './worker-attendance.service';

@Module({
  imports: [PrismaModule, forwardRef(() => AsyncJobsModule)],
  controllers: [AttendanceController],
  providers: [AttendanceService, WorkerAttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
