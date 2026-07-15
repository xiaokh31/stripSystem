import { Controller, Get, Query } from '@nestjs/common';
import { ContainerSuggestionsService } from './container-suggestions.service';
import { ContainerSuggestionQueryDto } from './dto/container-suggestion-query.dto';
import { ContainerSuggestionListResponseDto } from './dto/container-suggestion-response.dto';
import { RequirePermissions } from '../auth/auth.decorators';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';

@Controller('containers')
export class ContainerSuggestionsController {
  constructor(private readonly suggestions: ContainerSuggestionsService) {}

  @Get('suggestions')
  @RequirePermissions(...ROUTE_PERMISSIONS.containers.read)
  list(
    @Query() query: ContainerSuggestionQueryDto,
  ): Promise<ContainerSuggestionListResponseDto> {
    return this.suggestions.list(query);
  }
}

@Controller('inventory')
export class InventoryContainerSuggestionsController {
  constructor(private readonly suggestions: ContainerSuggestionsService) {}

  @Get('container-suggestions')
  @RequirePermissions(...ROUTE_PERMISSIONS.inventory.read)
  list(
    @Query() query: ContainerSuggestionQueryDto,
  ): Promise<ContainerSuggestionListResponseDto> {
    return this.suggestions.list(query);
  }
}
