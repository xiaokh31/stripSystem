import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import {
  CompleteUnloadingDto,
  CreatePayContainerDto,
  GenerateUnloadingWageSettlementDto,
  ListPayContainersQueryDto,
  PayContainerListResponseDto,
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

  @Get('pay-containers')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingWage.listPayContainers)
  listPayContainers(
    @Query() query: ListPayContainersQueryDto,
  ): Promise<PayContainerListResponseDto> {
    return this.unloadingWageService.listPayContainers(query);
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

  @Get('unloading-wage-settlements/:id/files/:fileId/download')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingWage.getSettlement)
  async downloadSettlementFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const download = await this.unloadingWageService.downloadSettlementFile(
      id,
      fileId,
    );
    response.set({
      'Content-Disposition': this.contentDisposition(download.filename),
      'Content-Length': download.fileSizeBytes.toString(),
      'Content-Type': download.mimeType,
    });

    return new StreamableFile(download.buffer);
  }

  private contentDisposition(filename: string): string {
    const fallback = filename.replace(/[^A-Za-z0-9._-]+/g, '_');
    return `attachment; filename="${fallback || 'download'}"; filename*=UTF-8''${encodeURIComponent(
      filename,
    )}`;
  }
}
