import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import {
  InventoryAdjustmentListResponseDto,
  InventoryAdjustmentResponseDto,
} from './dto/inventory-adjustment-response.dto';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';

@Controller('container-destinations')
export class InventoryAdjustmentsController {
  constructor(
    private readonly inventoryAdjustmentsService: InventoryAdjustmentsService,
  ) {}

  @Post(':id/inventory-adjustments')
  @RequirePermissions(...ROUTE_PERMISSIONS.inventory.adjust)
  create(
    @Param('id') id: string,
    @Body() dto: CreateInventoryAdjustmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InventoryAdjustmentResponseDto> {
    return this.inventoryAdjustmentsService.create(id, dto, actor);
  }

  @Get(':id/inventory-adjustments')
  @RequirePermissions(...ROUTE_PERMISSIONS.inventory.read)
  list(@Param('id') id: string): Promise<InventoryAdjustmentListResponseDto> {
    return this.inventoryAdjustmentsService.list(id);
  }
}
