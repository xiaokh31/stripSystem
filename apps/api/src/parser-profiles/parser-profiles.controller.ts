import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import {
  parseApproveParserProfileDto,
  parseGovernParserProfileDto,
  parseListParserProfilesQuery,
} from './dto/parser-profile-governance.dto';
import { ParserProfilesService } from './parser-profiles.service';

@Controller('parser-profiles')
export class ParserProfilesController {
  constructor(private readonly service: ParserProfilesService) {}

  @Get()
  @RequirePermissions(...ROUTE_PERMISSIONS.parserProfiles.read)
  list(@Query() query: unknown): Promise<unknown> {
    return this.service.list(parseListParserProfilesQuery(query));
  }

  @Get('families/:id')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserProfiles.read)
  family(@Param('id') id: string): Promise<unknown> {
    return this.service.getFamily(id);
  }

  @Get('versions/:id')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserProfiles.read)
  version(@Param('id') id: string): Promise<unknown> {
    return this.service.getVersion(id);
  }

  @Post('versions/:id/approve')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserProfiles.approve)
  approve(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.approve(id, parseApproveParserProfileDto(body), actor);
  }

  @Post('versions/:id/pause')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserProfiles.approve)
  pause(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.pause(id, parseGovernParserProfileDto(body), actor);
  }

  @Post('versions/:id/resume')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserProfiles.approve)
  resume(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.resume(id, parseGovernParserProfileDto(body), actor);
  }

  @Post('versions/:id/retire')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserProfiles.approve)
  retire(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.retire(id, parseGovernParserProfileDto(body), actor);
  }

  @Post('versions/:id/fork')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserProfiles.train)
  fork(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.fork(id, parseGovernParserProfileDto(body), actor);
  }
}
