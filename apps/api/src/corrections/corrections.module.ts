import { Module } from '@nestjs/common';
import { ContainerDestinationsController } from './container-destinations.controller';
import { ContainersController } from './containers.controller';
import { CorrectionsController } from './corrections.controller';
import { CorrectionsService } from './corrections.service';
import { PalletInventorySyncModule } from '../pallet-inventory-sync/pallet-inventory-sync.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PrismaModule, PalletInventorySyncModule, SettingsModule],
  controllers: [
    ContainersController,
    ContainerDestinationsController,
    CorrectionsController,
  ],
  providers: [CorrectionsService],
})
export class CorrectionsModule {}
