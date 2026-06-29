import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import {
  ContainerCorrectionResponseDto,
  ContainerDetailResponseDto,
  ContainerDestinationCorrectionResponseDto,
  ManualContainerResponseDto,
} from './dto/correction-response.dto';
import { CreateContainerDestinationDto } from './dto/create-container-destination.dto';
import { CreateManualContainerDto } from './dto/create-manual-container.dto';
import { UpdateContainerDto } from './dto/update-container.dto';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';

@Controller('containers')
export class ContainersController {
  constructor(private readonly correctionsService: CorrectionsService) {}

  @Post('manual')
  @RequirePermissions(...ROUTE_PERMISSIONS.containers.createManual)
  createManualContainer(
    @Body() dto: CreateManualContainerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ManualContainerResponseDto> {
    return this.correctionsService.createManualContainer(dto, actor);
  }

  @Get(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.containers.read)
  getContainer(@Param('id') id: string): Promise<ContainerDetailResponseDto> {
    return this.correctionsService.getContainer(id);
  }

  @Patch(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.containers.update)
  updateContainer(
    @Param('id') id: string,
    @Body() dto: UpdateContainerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ContainerCorrectionResponseDto> {
    return this.correctionsService.updateContainer(id, dto, actor);
  }

  @Post(':id/destinations')
  @RequirePermissions(...ROUTE_PERMISSIONS.containers.createDestination)
  createContainerDestination(
    @Param('id') id: string,
    @Body() dto: CreateContainerDestinationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ContainerDestinationCorrectionResponseDto> {
    return this.correctionsService.createContainerDestination(id, dto, actor);
  }
}
