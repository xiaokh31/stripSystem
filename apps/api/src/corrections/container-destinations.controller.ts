import { Body, Controller, Param, Patch } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import { ContainerDestinationCorrectionResponseDto } from './dto/correction-response.dto';
import { UpdateContainerDestinationDto } from './dto/update-container-destination.dto';

@Controller('container-destinations')
export class ContainerDestinationsController {
  constructor(private readonly correctionsService: CorrectionsService) {}

  @Patch(':id')
  updateContainerDestination(
    @Param('id') id: string,
    @Body() dto: UpdateContainerDestinationDto,
  ): Promise<ContainerDestinationCorrectionResponseDto> {
    return this.correctionsService.updateContainerDestination(id, dto);
  }
}
