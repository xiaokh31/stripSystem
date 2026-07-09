import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseHealth, PrismaService } from '../prisma/prisma.service';
import { operationalDateTime } from '../common/operational-time';
import { AsyncJobsService } from '../async-jobs/async-jobs.service';
import { QueueHealthResponseDto } from '../async-jobs/async-job-response.dto';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  database: DatabaseHealth;
  queue?: QueueHealthResponseDto;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional()
    private readonly asyncJobsService?: AsyncJobsService,
  ) {}

  async check(): Promise<HealthResponse> {
    const database = await this.prisma.checkConnection();
    const queue = await this.asyncJobsService?.checkHealth();
    const queueHealthy =
      !queue || queue.status === 'up' || queue.status === 'disabled';

    return {
      status: database.status === 'up' && queueHealthy ? 'ok' : 'degraded',
      version: this.configService.get<string>('app.version') ?? '0.0.1',
      database,
      queue,
      timestamp: operationalDateTime(),
    };
  }
}
