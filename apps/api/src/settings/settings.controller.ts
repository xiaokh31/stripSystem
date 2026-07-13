import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import {
  OperationalSettingsMutationResponseDto,
  OperationalSettingsResponseDto,
  PalletPolicySnapshotDto,
} from './dto/operational-settings-response.dto';
import { UpdateOperationalSettingsDto } from './dto/update-operational-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('operational')
  @RequirePermissions(...ROUTE_PERMISSIONS.settings.read)
  getOperationalSettings(): Promise<OperationalSettingsResponseDto> {
    return this.settingsService.getOperationalSettings();
  }

  @Get('pallet-policy')
  @RequirePermissions(...ROUTE_PERMISSIONS.settings.read)
  getPalletPolicy(): Promise<PalletPolicySnapshotDto> {
    return this.settingsService.getPalletPolicy();
  }

  @Patch('operational')
  @RequirePermissions(...ROUTE_PERMISSIONS.settings.update)
  updateOperationalSettings(
    @Body() dto: UpdateOperationalSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OperationalSettingsMutationResponseDto> {
    return this.settingsService.updateOperationalSettings(dto, actor);
  }
}
