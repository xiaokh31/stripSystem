import { Module, forwardRef } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { WorkerParserService } from './worker-parser.service';
import { AsyncJobsModule } from '../async-jobs/async-jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ParserLearningCasesModule } from '../parser-learning-cases/parser-learning-cases.module';
import { ParserProfilesModule } from '../parser-profiles/parser-profiles.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    PrismaModule,
    ParserLearningCasesModule,
    ParserProfilesModule,
    SettingsModule,
    forwardRef(() => AsyncJobsModule),
  ],
  controllers: [ImportsController],
  providers: [ImportsService, WorkerParserService],
  exports: [ImportsService],
})
export class ImportsModule {}
