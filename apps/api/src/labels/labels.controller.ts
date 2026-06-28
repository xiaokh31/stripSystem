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

@Controller()
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post('containers/:id/generate-labels')
  generateLabels(@Param('id') id: string): Promise<GenerateLabelsResponseDto> {
    return this.labelsService.generateLabels(id);
  }

  @Post('containers/:id/labels/reprint')
  reprintContainerLabels(
    @Param('id') id: string,
    @Body() dto: ReprintLabelDto,
  ): Promise<ContainerLabelReprintResponseDto> {
    return this.labelsService.reprintContainerLabels(id, dto);
  }

  @Get('pallets')
  listPallets(
    @Query() query: ListPalletsQueryDto,
  ): Promise<PalletListResponseDto> {
    return this.labelsService.listPallets(query.containerId);
  }

  @Post('pallets/:id/print')
  reprintPalletLabel(
    @Param('id') id: string,
    @Body() dto: ReprintLabelDto,
  ): Promise<PalletReprintResponseDto> {
    return this.labelsService.reprintPalletLabel(id, dto);
  }
}
