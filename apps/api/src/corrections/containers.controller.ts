import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import {
  ContainerCorrectionResponseDto,
  ContainerDetailResponseDto,
  ContainerDestinationCorrectionResponseDto,
} from './dto/correction-response.dto';
import { CreateContainerDestinationDto } from './dto/create-container-destination.dto';
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

  @Post(':id/destinations')
  createContainerDestination(
    @Param('id') id: string,
    @Body() dto: CreateContainerDestinationDto,
  ): Promise<ContainerDestinationCorrectionResponseDto> {
    return this.correctionsService.createContainerDestination(id, dto);
  }
}
