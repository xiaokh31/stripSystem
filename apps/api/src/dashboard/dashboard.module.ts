import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CorrectionsModule } from '../corrections/corrections.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { OperationsReviewService } from './operations-review.service';

@Module({
  imports: [ConfigModule, PrismaModule, CorrectionsModule],
  controllers: [DashboardController],
  providers: [DashboardService, OperationsReviewService],
  exports: [DashboardService, OperationsReviewService],
})
export class DashboardModule {}
