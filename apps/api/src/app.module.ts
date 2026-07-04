import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { appConfig } from './config/app.config';
import { CorrectionsModule } from './corrections/corrections.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { LabelsModule } from './labels/labels.module';
import { LoadJobsModule } from './load-jobs/load-jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig],
    }),
    AuthModule,
    AttendanceModule,
    PrismaModule,
    HealthModule,
    ImportsModule,
    CorrectionsModule,
    ReportsModule,
    LabelsModule,
    LoadJobsModule,
    UsersModule,
    RolesModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
