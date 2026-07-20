import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import {
  CloseParserLearningCaseDto,
  LinkParserLearningCaseContainerDto,
  ParserLearningCaseResponseDto,
  ParserLearningCaseListResponseDto,
  StartParserLearningCaseDto,
  parseCloseParserLearningCaseDto,
  parseLinkParserLearningCaseContainerDto,
  parseStartParserLearningCaseDto,
} from './dto/parser-learning-case.dto';
import {
  parseListParserLearningCasesQuery,
  parseParserProfileRevisionDto,
  parseQueueParserProfileReplayDto,
  parseSaveParserProfileDraftDto,
  parseSubmitParserProfileCandidateDto,
} from './dto/parser-profile-learning.dto';
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

  @Get()
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.read)
  list(@Query() query: unknown): Promise<ParserLearningCaseListResponseDto> {
    return this.service.list(parseListParserLearningCasesQuery(query));
  }

  @Get(':id')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.read)
  get(@Param('id') id: string): Promise<ParserLearningCaseResponseDto> {
    return this.service.get(id);
  }

  @Post(':id/inspect')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.train)
  inspect(@Param('id') id: string): Promise<unknown> {
    return this.service.inspect(id);
  }

  @Put(':id/draft')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.train)
  saveDraft(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    return this.service.saveDraft(
      id,
      parseSaveParserProfileDraftDto(body),
      actor,
    );
  }

  @Post(':id/preview')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.train)
  preview(@Param('id') id: string, @Body() body: unknown): Promise<unknown> {
    return this.service.preview(id, parseParserProfileRevisionDto(body));
  }

  @Post(':id/replay')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.train)
  replay(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.queueReplay(
      id,
      parseQueueParserProfileReplayDto(body),
      actor,
    );
  }

  @Post(':id/completion/catch-up')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.train)
  catchUpCompletion(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.catchUpCompletion(id, actor);
  }

  @Get(':id/replay-jobs/:jobId')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.read)
  replayJob(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ): Promise<unknown> {
    return this.service.getReplayJob(id, jobId);
  }

  @Get(':id/replays')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.read)
  replays(@Param('id') id: string): Promise<unknown> {
    return this.service.listReplayArtifacts(id);
  }

  @Get(':id/replays/:artifactId/download')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.read)
  async downloadReplay(
    @Param('id') id: string,
    @Param('artifactId') artifactId: string,
  ): Promise<StreamableFile> {
    const download = await this.service.downloadReplayArtifact(id, artifactId);
    return new StreamableFile(download.buffer, {
      type: download.mimeType,
      disposition: `attachment; filename="${download.filename.replace(/[^A-Za-z0-9._-]+/g, '_')}"`,
      length: download.fileSizeBytes,
    });
  }

  @Post(':id/submit')
  @RequirePermissions(...ROUTE_PERMISSIONS.parserLearningCases.train)
  submit(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.submitCandidate(
      id,
      parseSubmitParserProfileCandidateDto(body),
      actor,
    );
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
