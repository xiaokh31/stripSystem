import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import {
  ContainerCorrectionResponseDto,
  ContainerDetailResponseDto,
} from './dto/correction-response.dto';
import { UpdateContainerDto } from './dto/update-container.dto';

@Controller('containers')
export class ContainersController {
  constructor(private readonly correctionsService: CorrectionsService) {}

  @Get(':id')
  getContainer(@Param('id') id: string): Promise<ContainerDetailResponseDto> {
    return this.correctionsService.getContainer(id);
  }

  @Patch(':id')
  updateContainer(
    @Param('id') id: string,
    @Body() dto: UpdateContainerDto,
  ): Promise<ContainerCorrectionResponseDto> {
    return this.correctionsService.updateContainer(id, dto);
  }
}
