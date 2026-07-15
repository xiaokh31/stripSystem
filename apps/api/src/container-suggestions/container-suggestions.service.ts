import { Injectable } from '@nestjs/common';
import { ContainerSuggestionQueryDto } from './dto/container-suggestion-query.dto';
import { ContainerSuggestionListResponseDto } from './dto/container-suggestion-response.dto';
import {
  escapeSqlLikePattern,
  normalizeContainerSearchValue,
} from '../common/container-search';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContainerSuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ContainerSuggestionQueryDto,
  ): Promise<ContainerSuggestionListResponseDto> {
    const normalizedQuery = normalizeContainerSearchValue(query.query);
    if (!normalizedQuery) {
      return { items: [] };
    }

    const escapedQuery = escapeSqlLikePattern(normalizedQuery);
    const rows = await this.prisma.$queryRaw<
      Array<{ containerId: string; containerNo: string }>
    >`
      SELECT "id" AS "containerId", "container_no" AS "containerNo"
      FROM "containers"
      WHERE LOWER("container_no") LIKE ${`%${escapedQuery}%`} ESCAPE '\\'
      ORDER BY CASE
        WHEN LOWER("container_no") = ${normalizedQuery} THEN 0
        WHEN LOWER("container_no") LIKE ${`${escapedQuery}%`} ESCAPE '\\' THEN 1
        ELSE 2
      END,
      "container_no" ASC,
      "id" ASC
      LIMIT ${query.limit}
    `;

    return { items: rows };
  }
}
