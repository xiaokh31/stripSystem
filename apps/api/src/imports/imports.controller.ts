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
import { ListImportsQueryDto } from './dto/list-imports-query.dto';
import {
  ImportFileListResponseDto,
  ImportFileResponseDto,
  ImportParseResultResponseDto,
} from './dto/import-file-response.dto';
import { ImportsService } from './imports.service';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

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

  @Post(':id/parse')
  @RequirePermissions(...ROUTE_PERMISSIONS.imports.parse)
  parse(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ImportParseResultResponseDto> {
    return this.importsService.parse(id, actor);
  }

  @Get(':id/parse-result')
  @RequirePermissions(...ROUTE_PERMISSIONS.imports.getParseResult)
  getParseResult(
    @Param('id') id: string,
  ): Promise<ImportParseResultResponseDto> {
    return this.importsService.getParseResult(id);
  }
}
