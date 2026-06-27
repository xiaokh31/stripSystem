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

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  upload(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ImportFileResponseDto> {
    if (!file) {
      throw new BadRequestException({
        code: 'IMPORT_FILE_REQUIRED',
        message: 'An .xlsx file must be uploaded in the file field.',
        details: {},
      });
    }

    return this.importsService.importFile(file);
  }

  @Get()
  list(
    @Query() query: ListImportsQueryDto,
  ): Promise<ImportFileListResponseDto> {
    return this.importsService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<ImportFileResponseDto> {
    return this.importsService.getById(id);
  }

  @Post(':id/parse')
  parse(@Param('id') id: string): Promise<ImportParseResultResponseDto> {
    return this.importsService.parse(id);
  }

  @Get(':id/parse-result')
  getParseResult(
    @Param('id') id: string,
  ): Promise<ImportParseResultResponseDto> {
    return this.importsService.getParseResult(id);
  }
}
