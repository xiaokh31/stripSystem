import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseHealth, PrismaService } from '../prisma/prisma.service';
import { operationalDateTime } from '../common/operational-time';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  database: DatabaseHealth;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async check(): Promise<HealthResponse> {
    const database = await this.prisma.checkConnection();

    return {
      status: database.status === 'up' ? 'ok' : 'degraded',
      version: this.configService.get<string>('app.version') ?? '0.0.1',
      database,
      timestamp: operationalDateTime(),
    };
  }
}
