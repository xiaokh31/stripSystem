import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import { CreateCorrectionDto } from './dto/create-correction.dto';
import {
  CorrectionFeedbackResponseDto,
  CorrectionListResponseDto,
} from './dto/correction-response.dto';
import { ListCorrectionsQueryDto } from './dto/list-corrections-query.dto';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';

@Controller('corrections')
export class CorrectionsController {
  constructor(private readonly correctionsService: CorrectionsService) {}

  @Post()
  @RequirePermissions(...ROUTE_PERMISSIONS.corrections.create)
  createCorrection(
    @Body() dto: CreateCorrectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CorrectionFeedbackResponseDto> {
    return this.correctionsService.createCorrection(dto, actor);
  }

  @Get()
  @RequirePermissions(...ROUTE_PERMISSIONS.corrections.list)
  listCorrections(
    @Query() query: ListCorrectionsQueryDto,
  ): Promise<CorrectionListResponseDto> {
    return this.correctionsService.listCorrections(query);
  }
}
