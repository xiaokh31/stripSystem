import { Module } from '@nestjs/common';
import { ContainerPalletInventorySyncService } from './container-pallet-inventory-sync.service';

@Module({
  providers: [ContainerPalletInventorySyncService],
  exports: [ContainerPalletInventorySyncService],
})
export class PalletInventorySyncModule {}
