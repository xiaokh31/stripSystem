import { Body, Controller, Param, Patch } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import { ContainerCorrectionResponseDto } from './dto/correction-response.dto';
import { UpdateContainerDto } from './dto/update-container.dto';

@Controller('containers')
export class ContainersController {
  constructor(private readonly correctionsService: CorrectionsService) {}

  @Patch(':id')
  updateContainer(
    @Param('id') id: string,
    @Body() dto: UpdateContainerDto,
  ): Promise<ContainerCorrectionResponseDto> {
    return this.correctionsService.updateContainer(id, dto);
  }
}
