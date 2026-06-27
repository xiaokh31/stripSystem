import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  GenerateLabelsResponseDto,
  PalletListResponseDto,
} from './dto/label-response.dto';
import { ListPalletsQueryDto } from './dto/list-pallets-query.dto';
import { LabelsService } from './labels.service';

@Controller()
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post('containers/:id/generate-labels')
  generateLabels(@Param('id') id: string): Promise<GenerateLabelsResponseDto> {
    return this.labelsService.generateLabels(id);
  }

  @Get('pallets')
  listPallets(
    @Query() query: ListPalletsQueryDto,
  ): Promise<PalletListResponseDto> {
    return this.labelsService.listPallets(query.containerId);
  }
}
