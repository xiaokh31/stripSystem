import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AsyncJobResponseDto } from '../async-jobs/async-job-response.dto';
import { AsyncJobsService } from '../async-jobs/async-jobs.service';
import { ASYNC_JOB_TARGET_TYPES } from '../async-jobs/async-jobs.types';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import { AsyncJobType } from '../generated/prisma/enums';
import { AttendanceService } from './attendance.service';
import {
  AttendanceImportListResponseDto,
  AttendanceImportResponseDto,
  AttendanceParseResultResponseDto,
  GenerateWageRecordResponseDto,
  WageGeneratedFileListResponseDto,
} from './dto/attendance-response.dto';
import { ListAttendanceImportsQueryDto } from './dto/list-attendance-imports-query.dto';

@Controller('attendance-imports')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly asyncJobsService: AsyncJobsService,
  ) {}

  @Post()
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.upload)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AttendanceImportResponseDto> {
    if (!file) {
      throw new BadRequestException({
        code: 'ATTENDANCE_FILE_REQUIRED',
        message:
          'A legacy .xls attendance file must be uploaded in the file field.',
        details: {},
      });
    }

    return this.attendanceService.importFile(file, actor);
  }

  @Get()
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.list)
  list(
    @Query() query: ListAttendanceImportsQueryDto,
  ): Promise<AttendanceImportListResponseDto> {
    return this.attendanceService.list(query);
  }

  @Get(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.getById)
  getById(@Param('id') id: string): Promise<AttendanceImportResponseDto> {
    return this.attendanceService.getById(id);
  }

  @Post(':id/parse')
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.parse)
  parse(@Param('id') id: string): Promise<AttendanceParseResultResponseDto> {
    return this.attendanceService.parse(id);
  }

  @Post(':id/parse-job')
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.parse)
  submitParseJob(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AsyncJobResponseDto> {
    return this.asyncJobsService.submitJob({
      jobType: AsyncJobType.ATTENDANCE_PARSE,
      targetType: ASYNC_JOB_TARGET_TYPES.attendanceImport,
      targetId: id,
      attendanceImportId: id,
      actor,
      metadata: {
        sourceRoute: 'POST /attendance-imports/:id/parse-job',
      },
    });
  }

  @Get(':id/parse-result')
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.getParseResult)
  getParseResult(
    @Param('id') id: string,
  ): Promise<AttendanceParseResultResponseDto> {
    return this.attendanceService.getParseResult(id);
  }

  @Post(':id/generate-wage-record')
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.generateWageRecord)
  generateWageRecord(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<GenerateWageRecordResponseDto> {
    return this.attendanceService.generateWageRecord(id, actor);
  }

  @Post(':id/generate-wage-record-job')
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.generateWageRecord)
  submitGenerateWageRecordJob(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AsyncJobResponseDto> {
    return this.asyncJobsService.submitJob({
      jobType: AsyncJobType.WAGE_RECORD_GENERATION,
      targetType: ASYNC_JOB_TARGET_TYPES.attendanceImport,
      targetId: id,
      attendanceImportId: id,
      actor,
      metadata: {
        sourceRoute: 'POST /attendance-imports/:id/generate-wage-record-job',
      },
    });
  }

  @Get(':id/files')
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.listFiles)
  listFiles(
    @Param('id') id: string,
  ): Promise<WageGeneratedFileListResponseDto> {
    return this.attendanceService.listFiles(id);
  }

  @Get(':id/files/:fileId/download')
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.listFiles)
  async downloadFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const download = await this.attendanceService.downloadFile(id, fileId);
    response.set({
      'Content-Disposition': this.contentDisposition(download.filename),
      'Content-Length': download.fileSizeBytes.toString(),
      'Content-Type': download.mimeType,
    });

    return new StreamableFile(download.buffer);
  }

  private contentDisposition(filename: string): string {
    const fallback = filename.replace(/[^A-Za-z0-9._-]+/g, '_');
    return `attachment; filename="${fallback || 'download'}"; filename*=UTF-8''${encodeURIComponent(
      filename,
    )}`;
  }
}
