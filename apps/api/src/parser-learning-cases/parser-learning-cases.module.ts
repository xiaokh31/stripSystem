import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ParserLearningCasesController } from './parser-learning-cases.controller';
import { ParserLearningCasesService } from './parser-learning-cases.service';

@Module({
  imports: [PrismaModule],
  controllers: [ParserLearningCasesController],
  providers: [ParserLearningCasesService],
  exports: [ParserLearningCasesService],
})
export class ParserLearningCasesModule {}
