import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import { CreateCorrectionDto } from './dto/create-correction.dto';
import {
  CorrectionFeedbackResponseDto,
  CorrectionListResponseDto,
} from './dto/correction-response.dto';
import { ListCorrectionsQueryDto } from './dto/list-corrections-query.dto';

@Controller('corrections')
export class CorrectionsController {
  constructor(private readonly correctionsService: CorrectionsService) {}

  @Post()
  createCorrection(
    @Body() dto: CreateCorrectionDto,
  ): Promise<CorrectionFeedbackResponseDto> {
    return this.correctionsService.createCorrection(dto);
  }

  @Get()
  listCorrections(
    @Query() query: ListCorrectionsQueryDto,
  ): Promise<CorrectionListResponseDto> {
    return this.correctionsService.listCorrections(query);
  }
}
