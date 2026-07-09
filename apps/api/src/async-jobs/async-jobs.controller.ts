import { Controller, Get, Param } from '@nestjs/common';
import {
  AsyncJobResponseDto,
  QueueHealthResponseDto,
} from './async-job-response.dto';
import { AsyncJobsService } from './async-jobs.service';
import { Public } from '../auth/auth.decorators';

@Controller('queue')
export class AsyncJobsController {
  constructor(private readonly asyncJobsService: AsyncJobsService) {}

  @Get('health')
  @Public()
  health(): Promise<QueueHealthResponseDto> {
    return this.asyncJobsService.checkHealth();
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string): Promise<AsyncJobResponseDto> {
    return this.asyncJobsService.getJob(id);
  }
}
