import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryAdjustmentsController } from './inventory-adjustments.controller';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';

@Module({
  imports: [PrismaModule],
  controllers: [InventoryAdjustmentsController],
  providers: [InventoryAdjustmentsService],
})
export class InventoryAdjustmentsModule {}
