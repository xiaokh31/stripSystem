import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  GeneratedFileDownloadDto,
  GeneratedFileListResponseDto,
  GenerateReportResponseDto,
} from './dto/generated-file-response.dto';
import { ReportsService } from './reports.service';
import { RequirePermissions } from '../auth/auth.decorators';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';

@Controller('containers')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post(':id/generate-report')
  @RequirePermissions(...ROUTE_PERMISSIONS.reports.generate)
  generateReport(@Param('id') id: string): Promise<GenerateReportResponseDto> {
    return this.reportsService.generateReport(id);
  }

  @Get(':id/files')
  @RequirePermissions(...ROUTE_PERMISSIONS.reports.listFiles)
  listFiles(@Param('id') id: string): Promise<GeneratedFileListResponseDto> {
    return this.reportsService.listFiles(id);
  }

  @Get(':id/files/:fileId/download')
  @RequirePermissions(...ROUTE_PERMISSIONS.reports.downloadFile)
  async downloadFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const download = await this.reportsService.downloadFile(id, fileId);
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
