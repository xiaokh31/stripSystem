import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { appConfig } from './config/app.config';
import { CorrectionsModule } from './corrections/corrections.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { LabelsModule } from './labels/labels.module';
import { LoadJobsModule } from './load-jobs/load-jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig],
    }),
    AuthModule,
    PrismaModule,
    HealthModule,
    ImportsModule,
    CorrectionsModule,
    ReportsModule,
    LabelsModule,
    LoadJobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
