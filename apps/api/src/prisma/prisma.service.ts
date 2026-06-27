import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { DEFAULT_DATABASE_URL } from '../config/app.config';

export interface DatabaseHealth {
  status: 'up' | 'down';
  error?: {
    code: 'DATABASE_UNAVAILABLE';
    message: string;
  };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(private readonly configService: ConfigService) {
    const databaseUrl =
      configService.get<string>('app.databaseUrl') ?? DEFAULT_DATABASE_URL;

    super({
      adapter: new PrismaPg(databaseUrl),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async checkConnection(): Promise<DatabaseHealth> {
    try {
      await this.$queryRaw`SELECT 1`;
      return { status: 'up' };
    } catch (error) {
      return {
        status: 'down',
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: this.errorMessage(error),
        },
      };
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Database connection failed';
  }
}
