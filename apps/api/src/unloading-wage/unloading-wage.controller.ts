import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import {
  CompleteUnloadingDto,
  CreatePayContainerDto,
  GenerateUnloadingWageSettlementDto,
  PayContainerResponseDto,
  UnloadingWageSettlementListResponseDto,
  UnloadingWageSettlementResponseDto,
  UpdateContainerPayClassificationDto,
} from './dto/unloading-wage.dto';
import { UnloadingWageService } from './unloading-wage.service';

@Controller()
export class UnloadingWageController {
  constructor(private readonly unloadingWageService: UnloadingWageService) {}

  @Patch('containers/:id/pay-classification')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingWage.classifyContainer)
  classifyContainer(
    @Param('id') id: string,
    @Body() dto: UpdateContainerPayClassificationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ container: unknown }> {
    return this.unloadingWageService.updateContainerPayClassification(
      id,
      dto,
      actor,
    );
  }

  @Post('pay-containers')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingWage.createPayContainer)
  createPayContainer(
    @Body() dto: CreatePayContainerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PayContainerResponseDto> {
    return this.unloadingWageService.createPayContainer(dto, actor);
  }

  @Get('pay-containers/:id')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingWage.readPayContainer)
  getPayContainer(@Param('id') id: string): Promise<PayContainerResponseDto> {
    return this.unloadingWageService.getPayContainer(id);
  }

  @Post('pay-containers/:id/complete-unloading')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingWage.completePayContainer)
  completePayContainer(
    @Param('id') id: string,
    @Body() dto: CompleteUnloadingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PayContainerResponseDto> {
    return this.unloadingWageService.completePayContainer(id, dto, actor);
  }

  @Post('unloading-wage-settlements')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingWage.generateSettlement)
  generateSettlement(
    @Body() dto: GenerateUnloadingWageSettlementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UnloadingWageSettlementResponseDto> {
    return this.unloadingWageService.generateSettlement(dto, actor);
  }

  @Get('unloading-wage-settlements')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingWage.listSettlements)
  listSettlements(): Promise<UnloadingWageSettlementListResponseDto> {
    return this.unloadingWageService.listSettlements();
  }

  @Get('unloading-wage-settlements/:id')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingWage.getSettlement)
  getSettlement(
    @Param('id') id: string,
  ): Promise<UnloadingWageSettlementResponseDto> {
    return this.unloadingWageService.getSettlement(id);
  }
}
