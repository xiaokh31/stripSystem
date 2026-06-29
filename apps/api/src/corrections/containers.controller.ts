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
import { RequirePermissions } from '../auth/auth.decorators';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';

@Controller('containers')
export class ContainersController {
  constructor(private readonly correctionsService: CorrectionsService) {}

  @Post('manual')
  @RequirePermissions(...ROUTE_PERMISSIONS.containers.createManual)
  createManualContainer(
    @Body() dto: CreateManualContainerDto,
  ): Promise<ManualContainerResponseDto> {
    return this.correctionsService.createManualContainer(dto);
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
  ): Promise<ContainerCorrectionResponseDto> {
    return this.correctionsService.updateContainer(id, dto);
  }

  @Post(':id/destinations')
  @RequirePermissions(...ROUTE_PERMISSIONS.containers.createDestination)
  createContainerDestination(
    @Param('id') id: string,
    @Body() dto: CreateContainerDestinationDto,
  ): Promise<ContainerDestinationCorrectionResponseDto> {
    return this.correctionsService.createContainerDestination(id, dto);
  }
}
