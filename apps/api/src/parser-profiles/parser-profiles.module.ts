import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ParserLearningCasesModule } from '../parser-learning-cases/parser-learning-cases.module';
import { SettingsModule } from '../settings/settings.module';
import { ParserProfileReviewsController } from './parser-profile-reviews.controller';
import { ParserProfileReviewsService } from './parser-profile-reviews.service';
import { ParserProfilesController } from './parser-profiles.controller';
import { ParserProfilesService } from './parser-profiles.service';

@Module({
  imports: [ConfigModule, PrismaModule, ParserLearningCasesModule, SettingsModule],
  controllers: [ParserProfilesController, ParserProfileReviewsController],
  providers: [ParserProfilesService, ParserProfileReviewsService],
  exports: [ParserProfileReviewsService],
})
export class ParserProfilesModule {}
