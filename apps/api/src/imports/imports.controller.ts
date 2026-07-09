import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DeleteImportDto } from './dto/delete-import.dto';
import { ListImportsQueryDto } from './dto/list-imports-query.dto';
import {
  ImportFileListResponseDto,
  ImportFileResponseDto,
  ImportParseResultResponseDto,
} from './dto/import-file-response.dto';
import { ImportsService } from './imports.service';
import { AsyncJobResponseDto } from '../async-jobs/async-job-response.dto';
import { AsyncJobsService } from '../async-jobs/async-jobs.service';
import { ASYNC_JOB_TARGET_TYPES } from '../async-jobs/async-jobs.types';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import { AsyncJobType } from '../generated/prisma/enums';

@Controller('imports')
export class ImportsController {
  constructor(
    private readonly importsService: ImportsService,
    private readonly asyncJobsService: AsyncJobsService,
  ) {}

  @Post()
  @RequirePermissions(...ROUTE_PERMISSIONS.imports.upload)
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
  ): Promise<ImportFileResponseDto> {
    if (!file) {
      throw new BadRequestException({
        code: 'IMPORT_FILE_REQUIRED',
        message: 'An .xlsx file must be uploaded in the file field.',
        details: {},
      });
    }

    return this.importsService.importFile(file, actor);
  }

  @Get()
  @RequirePermissions(...ROUTE_PERMISSIONS.imports.list)
  list(
    @Query() query: ListImportsQueryDto,
  ): Promise<ImportFileListResponseDto> {
    return this.importsService.list(query);
  }

  @Get(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.imports.getById)
  getById(@Param('id') id: string): Promise<ImportFileResponseDto> {
    return this.importsService.getById(id);
  }

  @Delete(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.imports.delete)
  delete(
    @Param('id') id: string,
    @Body() dto: DeleteImportDto = {},
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ImportFileResponseDto> {
    return this.importsService.delete(id, dto, actor);
  }

  @Post(':id/parse')
  @RequirePermissions(...ROUTE_PERMISSIONS.imports.parse)
  parse(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ImportParseResultResponseDto> {
    return this.importsService.parse(id, actor);
  }

  @Post(':id/parse-job')
  @RequirePermissions(...ROUTE_PERMISSIONS.imports.parse)
  submitParseJob(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AsyncJobResponseDto> {
    return this.asyncJobsService.submitJob({
      jobType: AsyncJobType.UNLOADING_PARSE,
      targetType: ASYNC_JOB_TARGET_TYPES.importFile,
      targetId: id,
      importFileId: id,
      actor,
      metadata: {
        sourceRoute: 'POST /imports/:id/parse-job',
      },
    });
  }

  @Get(':id/parse-result')
  @RequirePermissions(...ROUTE_PERMISSIONS.imports.getParseResult)
  getParseResult(
    @Param('id') id: string,
  ): Promise<ImportParseResultResponseDto> {
    return this.importsService.getParseResult(id);
  }
}
