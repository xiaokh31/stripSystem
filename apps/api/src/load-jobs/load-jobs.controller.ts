import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CloseLoadJobDto } from './dto/close-load-job.dto';
import { CreateLoadJobDto } from './dto/create-load-job.dto';
import { ListLoadJobsQueryDto } from './dto/list-load-jobs-query.dto';
import {
  LoadJobListResponseDto,
  LoadJobResponseDto,
} from './dto/load-job-response.dto';
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

  @Post(':id/close')
  close(
    @Param('id') id: string,
    @Body() dto: CloseLoadJobDto = {},
  ): Promise<LoadJobResponseDto> {
    return this.loadJobsService.close(id, dto);
  }
}
