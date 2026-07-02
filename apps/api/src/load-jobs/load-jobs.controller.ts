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
  LoadJobOperatorHistoryResponseDto,
  LoadJobListResponseDto,
  LoadJobResponseDto,
  LoadJobScanResponseDto,
} from './dto/load-job-response.dto';
import { ReverseScanDto } from './dto/reverse-scan.dto';
import { ScanPalletDto } from './dto/scan-pallet.dto';
import { UpdateLoadJobDto } from './dto/update-load-job.dto';
import { LoadJobsService } from './load-jobs.service';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';

@Controller('load-jobs')
export class LoadJobsController {
  constructor(private readonly loadJobsService: LoadJobsService) {}

  @Post()
  @RequirePermissions(...ROUTE_PERMISSIONS.loadJobs.create)
  create(
    @Body() dto: CreateLoadJobDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LoadJobResponseDto> {
    return this.loadJobsService.create(dto, actor);
  }

  @Get()
  @RequirePermissions(...ROUTE_PERMISSIONS.loadJobs.read)
  list(@Query() query: ListLoadJobsQueryDto): Promise<LoadJobListResponseDto> {
    return this.loadJobsService.list(query);
  }

  @Get('operator-history/me')
  @RequirePermissions(...ROUTE_PERMISSIONS.loadJobs.read)
  listMyOperatorHistory(
    @Query() query: ListLoadJobsQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LoadJobOperatorHistoryResponseDto> {
    return this.loadJobsService.listOperatorHistory(actor, query);
  }

  @Get(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.loadJobs.read)
  getById(@Param('id') id: string): Promise<LoadJobResponseDto> {
    return this.loadJobsService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.loadJobs.update)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLoadJobDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LoadJobResponseDto> {
    return this.loadJobsService.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.loadJobs.delete)
  delete(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LoadJobResponseDto> {
    return this.loadJobsService.delete(id, actor);
  }

  @Get(':id/loaded-pallets')
  @RequirePermissions(...ROUTE_PERMISSIONS.loadJobs.read)
  listLoadedPallets(
    @Param('id') id: string,
  ): Promise<LoadJobLoadedPalletsResponseDto> {
    return this.loadJobsService.listLoadedPallets(id);
  }

  @Post(':id/close')
  @RequirePermissions(...ROUTE_PERMISSIONS.loadJobs.complete)
  close(
    @Param('id') id: string,
    @Body() dto: CloseLoadJobDto = {},
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LoadJobResponseDto> {
    return this.loadJobsService.close(id, dto, actor);
  }

  @Post(':id/scan')
  @RequirePermissions(...ROUTE_PERMISSIONS.loadJobs.scan)
  scan(
    @Param('id') id: string,
    @Body() dto: ScanPalletDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LoadJobScanResponseDto> {
    return this.loadJobsService.scan(id, dto, actor);
  }

  @Post(':id/scan/reverse')
  @RequirePermissions(...ROUTE_PERMISSIONS.loadJobs.reverseScan)
  reverseScan(
    @Param('id') id: string,
    @Body() dto: ReverseScanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LoadJobScanResponseDto> {
    return this.loadJobsService.reverseScan(id, dto, actor);
  }
}
