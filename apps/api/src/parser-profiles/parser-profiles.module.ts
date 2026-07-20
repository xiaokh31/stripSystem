import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ParserProfilesController } from './parser-profiles.controller';
import { ParserProfilesService } from './parser-profiles.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ParserProfilesController],
  providers: [ParserProfilesService],
})
export class ParserProfilesModule {}
