import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PERMISSIONS } from '../auth/permissions';
import {
  parseParserReviewCorrectDto,
  parseParserReviewDecisionDto,
  parseParserReviewRejectDto,
} from './dto/parser-profile-review.dto';
import { ParserProfileReviewsService } from './parser-profile-reviews.service';

@Controller('imports/:importFileId/profile-review')
export class ParserProfileReviewsController {
  constructor(private readonly service: ParserProfileReviewsService) {}

  @Get()
  @RequirePermissions(
    PERMISSIONS.imports.read,
    PERMISSIONS.parserProfiles.read,
  )
  get(@Param('importFileId') importFileId: string): Promise<unknown> {
    return this.service.getByImport(importFileId);
  }

  @Post('accept')
  @RequirePermissions(
    PERMISSIONS.parserProfiles.review,
    PERMISSIONS.containers.update,
    PERMISSIONS.corrections.create,
  )
  accept(
    @Param('importFileId') importFileId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.accept(
      importFileId,
      parseParserReviewDecisionDto(body),
      actor,
    );
  }

  @Post('correct')
  @RequirePermissions(
    PERMISSIONS.parserProfiles.review,
    PERMISSIONS.containers.update,
    PERMISSIONS.corrections.create,
  )
  correct(
    @Param('importFileId') importFileId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.correct(
      importFileId,
      parseParserReviewCorrectDto(body),
      actor,
    );
  }

  @Post('reject')
  @RequirePermissions(
    PERMISSIONS.parserProfiles.review,
    PERMISSIONS.containers.update,
    PERMISSIONS.corrections.create,
  )
  reject(
    @Param('importFileId') importFileId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.reject(
      importFileId,
      parseParserReviewRejectDto(body),
      actor,
    );
  }
}
