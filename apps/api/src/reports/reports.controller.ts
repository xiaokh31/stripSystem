import { Controller, Get, Param, Post } from '@nestjs/common';
import {
  GeneratedFileListResponseDto,
  GenerateReportResponseDto,
} from './dto/generated-file-response.dto';
import { ReportsService } from './reports.service';

@Controller('containers')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post(':id/generate-report')
  generateReport(@Param('id') id: string): Promise<GenerateReportResponseDto> {
    return this.reportsService.generateReport(id);
  }

  @Get(':id/files')
  listFiles(@Param('id') id: string): Promise<GeneratedFileListResponseDto> {
    return this.reportsService.listFiles(id);
  }
}
