import { Module } from '@nestjs/common';
import {
  ContainerSuggestionsController,
  InventoryContainerSuggestionsController,
} from './container-suggestions.controller';
import { ContainerSuggestionsService } from './container-suggestions.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    ContainerSuggestionsController,
    InventoryContainerSuggestionsController,
  ],
  providers: [ContainerSuggestionsService],
})
export class ContainerSuggestionsModule {}
