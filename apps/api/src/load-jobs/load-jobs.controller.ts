import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CloseLoadJobDto } from './dto/close-load-job.dto';
import { CreateLoadJobDto } from './dto/create-load-job.dto';
import { ListLoadJobsQueryDto } from './dto/list-load-jobs-query.dto';
import {
  LoadJobLoadedPalletsResponseDto,
  LoadJobListResponseDto,
  LoadJobResponseDto,
  LoadJobScanResponseDto,
} from './dto/load-job-response.dto';
import { ReverseScanDto } from './dto/reverse-scan.dto';
import { ScanPalletDto } from './dto/scan-pallet.dto';
import { UpdateLoadJobDto } from './dto/update-load-job.dto';
import { LoadJobsService } from './load-jobs.service';

@Controller('load-jobs')
export class LoadJobsController {
  constructor(private readonly loadJobsService: LoadJobsService) {}

  @Post()
  create(@Body() dto: CreateLoadJobDto): Promise<LoadJobResponseDto> {
    return this.loadJobsService.create(dto);
  }

  @Get()
  list(@Query() query: ListLoadJobsQueryDto): Promise<LoadJobListResponseDto> {
    return this.loadJobsService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<LoadJobResponseDto> {
    return this.loadJobsService.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLoadJobDto,
  ): Promise<LoadJobResponseDto> {
    return this.loadJobsService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<LoadJobResponseDto> {
    return this.loadJobsService.delete(id);
  }

  @Get(':id/loaded-pallets')
  listLoadedPallets(
    @Param('id') id: string,
  ): Promise<LoadJobLoadedPalletsResponseDto> {
    return this.loadJobsService.listLoadedPallets(id);
  }

  @Post(':id/close')
  close(
    @Param('id') id: string,
    @Body() dto: CloseLoadJobDto = {},
  ): Promise<LoadJobResponseDto> {
    return this.loadJobsService.close(id, dto);
  }

  @Post(':id/scan')
  scan(
    @Param('id') id: string,
    @Body() dto: ScanPalletDto,
  ): Promise<LoadJobScanResponseDto> {
    return this.loadJobsService.scan(id, dto);
  }

  @Post(':id/scan/reverse')
  reverseScan(
    @Param('id') id: string,
    @Body() dto: ReverseScanDto,
  ): Promise<LoadJobScanResponseDto> {
    return this.loadJobsService.reverseScan(id, dto);
  }
}
