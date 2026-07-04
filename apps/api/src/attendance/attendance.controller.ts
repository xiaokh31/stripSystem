import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
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
  constructor(private readonly attendanceService: AttendanceService) {}

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

  @Get(':id/files')
  @RequirePermissions(...ROUTE_PERMISSIONS.attendance.listFiles)
  listFiles(
    @Param('id') id: string,
  ): Promise<WageGeneratedFileListResponseDto> {
    return this.attendanceService.listFiles(id);
  }
}
