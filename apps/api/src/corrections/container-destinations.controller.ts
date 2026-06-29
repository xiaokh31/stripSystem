import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import { ContainerDestinationCorrectionResponseDto } from './dto/correction-response.dto';
import { UpdateContainerDestinationDto } from './dto/update-container-destination.dto';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';

@Controller('container-destinations')
export class ContainerDestinationsController {
  constructor(private readonly correctionsService: CorrectionsService) {}

  @Patch(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.containerDestinations.update)
  updateContainerDestination(
    @Param('id') id: string,
    @Body() dto: UpdateContainerDestinationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ContainerDestinationCorrectionResponseDto> {
    return this.correctionsService.updateContainerDestination(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.containerDestinations.delete)
  deleteContainerDestination(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ContainerDestinationCorrectionResponseDto> {
    return this.correctionsService.deleteContainerDestination(id, actor);
  }
}
