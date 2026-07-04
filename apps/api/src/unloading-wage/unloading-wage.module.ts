import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UnloadingWageController } from './unloading-wage.controller';
import { UnloadingWageService } from './unloading-wage.service';

@Module({
  imports: [PrismaModule],
  controllers: [UnloadingWageController],
  providers: [UnloadingWageService],
})
export class UnloadingWageModule {}
