import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import type { GeneratedFileDownloadDto } from '../reports/dto/generated-file-response.dto';
import {
  ExportUnloadingSummaryDto,
  ExportUnloadingSummaryResponseDto,
  UnloadingSummaryMonthQueryDto,
  UnloadingSummaryResponseDto,
} from './dto/unloading-summary.dto';
import { UnloadingSummaryService } from './unloading-summary.service';

@Controller('unloading-summary')
export class UnloadingSummaryController {
  constructor(
    private readonly unloadingSummaryService: UnloadingSummaryService,
  ) {}

  @Get()
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingSummary.read)
  getSummary(
    @Query() query: UnloadingSummaryMonthQueryDto,
  ): Promise<UnloadingSummaryResponseDto> {
    return this.unloadingSummaryService.getSummary(query.month);
  }

  @Post('exports')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingSummary.export)
  exportSummary(
    @Body() dto: ExportUnloadingSummaryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExportUnloadingSummaryResponseDto> {
    return this.unloadingSummaryService.exportSummary(dto.month, actor);
  }

  @Get('exports/:fileId/download')
  @RequirePermissions(...ROUTE_PERMISSIONS.unloadingSummary.downloadExport)
  async downloadExport(
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const download = await this.unloadingSummaryService.downloadExport(fileId);
    response.set({
      'Content-Disposition': this.contentDisposition(download),
      'Content-Length': download.fileSizeBytes.toString(),
      'Content-Type': download.mimeType,
    });

    return new StreamableFile(download.buffer);
  }

  private contentDisposition(download: GeneratedFileDownloadDto): string {
    const fallback = download.filename.replace(/[^A-Za-z0-9._-]+/g, '_');
    return `attachment; filename="${fallback || 'download'}"; filename*=UTF-8''${encodeURIComponent(
      download.filename,
    )}`;
  }
}
