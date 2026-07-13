import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { PalletPolicyResolver } from './pallet-policy.resolver';

@Module({
  imports: [PrismaModule],
  controllers: [SettingsController],
  providers: [SettingsService, PalletPolicyResolver],
  exports: [PalletPolicyResolver],
})
export class SettingsModule {}
