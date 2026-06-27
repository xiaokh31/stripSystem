import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LoadJobsController } from './load-jobs.controller';
import { LoadJobsService } from './load-jobs.service';

@Module({
  imports: [PrismaModule],
  controllers: [LoadJobsController],
  providers: [LoadJobsService],
  exports: [LoadJobsService],
})
export class LoadJobsModule {}
