import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ContainerDetailSummaryResponseDto,
  ContainerSummaryListResponseDto,
  InventoryListResponseDto,
} from './dto/inventory-response.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { InventoryReportsService } from './inventory-reports.service';

@Controller()
export class InventoryReportsController {
  constructor(
    private readonly inventoryReportsService: InventoryReportsService,
  ) {}

  @Get('reports/container-summary')
  containerSummary(
    @Query() query: InventoryQueryDto,
  ): Promise<ContainerSummaryListResponseDto> {
    return this.inventoryReportsService.containerSummary(query);
  }

  @Get('reports/inventory')
  inventory(
    @Query() query: InventoryQueryDto,
  ): Promise<InventoryListResponseDto> {
    return this.inventoryReportsService.inventory(query);
  }

  @Get('containers/:id/summary')
  containerDetailSummary(
    @Param('id') id: string,
    @Query() query: InventoryQueryDto,
  ): Promise<ContainerDetailSummaryResponseDto> {
    return this.inventoryReportsService.containerDetailSummary(id, query);
  }
}
