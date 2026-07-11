import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { DashboardOperationsQueryDto } from './dto/dashboard-query.dto';
import { OperationsDashboardResponseDto } from './dto/operations-dashboard-response.dto';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('operations')
  operations(
    @Query() query: DashboardOperationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OperationsDashboardResponseDto> {
    return this.dashboardService.operations(query, user);
  }
}
