import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ParserLearningCasesController } from './parser-learning-cases.controller';
import { ParserLearningCasesService } from './parser-learning-cases.service';
import { ParserProfileWorkerService } from './parser-profile-worker.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ParserLearningCasesController],
  providers: [ParserLearningCasesService, ParserProfileWorkerService],
  exports: [ParserLearningCasesService],
})
export class ParserLearningCasesModule {}
