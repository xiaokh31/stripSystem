import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ContainerLabelReprintResponseDto,
  GenerateLabelsResponseDto,
  PalletListResponseDto,
  PalletReprintResponseDto,
} from './dto/label-response.dto';
import { ListPalletsQueryDto } from './dto/list-pallets-query.dto';
import { ReprintLabelDto } from './dto/reprint-label.dto';
import { LabelsService } from './labels.service';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';

@Controller()
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post('containers/:id/generate-labels')
  @RequirePermissions(...ROUTE_PERMISSIONS.labels.generate)
  generateLabels(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<GenerateLabelsResponseDto> {
    return this.labelsService.generateLabels(id, actor);
  }

  @Post('containers/:id/labels/reprint')
  @RequirePermissions(...ROUTE_PERMISSIONS.labels.reprint)
  reprintContainerLabels(
    @Param('id') id: string,
    @Body() dto: ReprintLabelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ContainerLabelReprintResponseDto> {
    return this.labelsService.reprintContainerLabels(id, dto, actor);
  }

  @Get('pallets')
  @RequirePermissions(...ROUTE_PERMISSIONS.labels.listPallets)
  listPallets(
    @Query() query: ListPalletsQueryDto,
  ): Promise<PalletListResponseDto> {
    return this.labelsService.listPallets(query.containerId);
  }

  @Post('pallets/:id/print')
  @RequirePermissions(...ROUTE_PERMISSIONS.labels.reprint)
  reprintPalletLabel(
    @Param('id') id: string,
    @Body() dto: ReprintLabelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PalletReprintResponseDto> {
    return this.labelsService.reprintPalletLabel(id, dto, actor);
  }
}
