import { Module } from '@nestjs/common';
import { PalletInventorySyncModule } from '../pallet-inventory-sync/pallet-inventory-sync.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UnloadingWageController } from './unloading-wage.controller';
import { UnloadingWageService } from './unloading-wage.service';

@Module({
  imports: [PrismaModule, PalletInventorySyncModule],
  controllers: [UnloadingWageController],
  providers: [UnloadingWageService],
})
export class UnloadingWageModule {}
