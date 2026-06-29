import { Controller, Get } from '@nestjs/common';
import { HealthResponse, HealthService } from './health.service';
import { Public } from '../auth/auth.decorators';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
