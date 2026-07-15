import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { AsyncJobsModule } from './async-jobs/async-jobs.module';
import { appConfig } from './config/app.config';
import { CorrectionsModule } from './corrections/corrections.module';
import { ContainerSuggestionsModule } from './container-suggestions/container-suggestions.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { InventoryAdjustmentsModule } from './inventory-adjustments/inventory-adjustments.module';
import { LabelsModule } from './labels/labels.module';
import { LoadJobsModule } from './load-jobs/load-jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { SettingsModule } from './settings/settings.module';
import { UnloadingSummaryModule } from './unloading-summary/unloading-summary.module';
import { UnloadingWageModule } from './unloading-wage/unloading-wage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig],
    }),
    AuthModule,
    AsyncJobsModule,
    AttendanceModule,
    PrismaModule,
    HealthModule,
    DashboardModule,
    ImportsModule,
    InventoryAdjustmentsModule,
    ContainerSuggestionsModule,
    CorrectionsModule,
    ReportsModule,
    LabelsModule,
    LoadJobsModule,
    UsersModule,
    RolesModule,
    SettingsModule,
    UnloadingWageModule,
    UnloadingSummaryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
