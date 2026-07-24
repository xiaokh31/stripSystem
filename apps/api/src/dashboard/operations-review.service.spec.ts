import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PERMISSIONS, ROLE_CODES } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsReviewService } from './operations-review.service';

describe('OperationsReviewService', () => {
  it('returns bounded line records using the same predicate as the dashboard count', async () => {
    const prisma = {
      containerLine: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'line-1',
            lineNo: 7,
            destinationCode: null,
            cartons: 10,
            volume: null,
            updatedAt: new Date('2026-07-23T12:00:00.000Z'),
            container: {
              id: 'container-1',
              containerNo: 'DASH07-CONTAINER',
            },
          },
        ]),
      },
    };
    const service = new OperationsReviewService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.list(
        {
          code: 'DESTINATION_CARTON_VOLUME_MISSING',
          page: 1,
          pageSize: 25,
        },
        user([PERMISSIONS.containers.read]),
      ),
    ).resolves.toEqual({
      code: 'DESTINATION_CARTON_VOLUME_MISSING',
      items: [
        expect.objectContaining({
          id: 'line-1',
          sourceType: 'CONTAINER_LINE',
          targetId: 'container-1',
          href: '/containers/container-1?lineId=line-1#container-lines',
        }),
      ],
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
    });
    expect(prisma.containerLine.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { destinationCode: null },
          { cartons: null },
          { volume: null },
        ],
      },
    });
    expect(prisma.containerLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 25,
        where: {
          OR: [
            { destinationCode: null },
            { cartons: null },
            { volume: null },
          ],
        },
      }),
    );
  });

  it('denies a direct review URL when the user lacks its API permission', async () => {
    const service = new OperationsReviewService({} as PrismaService);
    await expect(
      service.list(
        {
          code: 'FAILED_GENERATED_FILES',
          page: 1,
          pageSize: 25,
        },
        user([]),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows ADMIN through the service boundary without exposing storage fields', async () => {
    const prisma = {
      generatedFile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'file-1',
          fileType: 'EXCEL_REPORT',
          status: 'FAILED',
          importFileId: 'import-1',
          containerId: null,
          updatedAt: new Date('2026-07-23T12:00:00.000Z'),
        }),
      },
      wageGeneratedFile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new OperationsReviewService(
      prisma as unknown as PrismaService,
    );
    const response = await service.list(
      {
        code: 'GENERATED_FILE_DETAIL',
        page: 1,
        pageSize: 25,
        recordId: 'file-1',
      },
      { ...user([]), roles: [ROLE_CODES.admin] },
    );
    expect(response.items[0]).not.toHaveProperty('storagePath');
    expect(response.items[0]).not.toHaveProperty('errorMessage');
  });

  it('resolves an exact wage generated file without exposing its storage record', async () => {
    const prisma = {
      generatedFile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      wageGeneratedFile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wage-file-1',
          fileType: 'UNLOADING_WAGE_XLSX',
          status: 'FAILED',
          attendanceImportId: null,
          unloadingWageSettlementId: 'settlement-1',
          updatedAt: new Date('2026-07-23T12:00:00.000Z'),
        }),
      },
    };
    const service = new OperationsReviewService(
      prisma as unknown as PrismaService,
    );

    const response = await service.list(
      {
        code: 'GENERATED_FILE_DETAIL',
        page: 1,
        pageSize: 25,
        recordId: 'wage-file-1',
      },
      user([PERMISSIONS.reports.read]),
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        id: 'wage-file-1',
        href: '/unloading-wage?settlementId=settlement-1',
        sourceType: 'WAGE_GENERATED_FILE',
      }),
    ]);
    expect(response.items[0]).not.toHaveProperty('storagePath');
  });
});

function user(permissions: string[]): AuthenticatedUser {
  return {
    id: 'dashboard-review-user',
    email: null,
    name: null,
    permissions,
    roles: [],
  };
}
