import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import {
  CloseParserLearningCaseDto,
  LinkParserLearningCaseContainerDto,
  ParserLearningCaseResponseDto,
  StartParserLearningCaseDto,
  parseCloseParserLearningCaseDto,
  parseLinkParserLearningCaseContainerDto,
  parseStartParserLearningCaseDto,
} from './dto/parser-learning-case.dto';
import { ParserLearningCasesService } from './parser-learning-cases.service';

@Controller('parser-learning-cases')
export class ParserLearningCasesController {
  constructor(private readonly service: ParserLearningCasesService) {}

  @Post()
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.train)
  start(
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    const dto: StartParserLearningCaseDto =
      parseStartParserLearningCaseDto(body);
    return this.service.start(dto.importFileId, actor);
  }

  @Get(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.read)
  get(@Param('id') id: string): Promise<ParserLearningCaseResponseDto> {
    return this.service.get(id);
  }

  @Post(':id/link-container')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.train)
  linkContainer(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    const dto: LinkParserLearningCaseContainerDto =
      parseLinkParserLearningCaseContainerDto(body);
    return this.service.linkContainer(id, dto.containerId, actor);
  }

  @Post(':id/unlink-container')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.train)
  unlinkContainer(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    return this.service.unlinkContainer(id, actor);
  }

  @Post(':id/close')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.train)
  close(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    const dto: CloseParserLearningCaseDto =
      parseCloseParserLearningCaseDto(body);
    return this.service.close(id, dto.reasonCode, actor);
  }
}
