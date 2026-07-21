import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  authHeaderFor,
  configureAuthTestEnv,
  type AuthTestUser,
} from './auth-test-helpers';

describe('Parser profile review trust gate with real-fixture-derived workbooks (e2e)', () => {
  jest.setTimeout(180_000);

  const sourceFixture = resolve(
    __dirname,
    '..',
    '..',
    '..',
    'samples',
    'unloading-plans',
    'CAAU8011090 UNLOADING PLAN.xlsx',
  );
  const mappingFixture = resolve(
    __dirname,
    '..',
    '..',
    'worker-python',
    'tests',
    'fixtures',
    'parser_profiles',
    'unloading-plan-sheet1-v1.json',
  );
  const workerDir = resolve(__dirname, '..', '..', 'worker-python');

  let app: INestApplication<App>;
  let prisma: any;
  let storageRoot: string;
  let priorStorageRoot: string | undefined;
  let fixtureDir: string;
  let runId: string;
  let office: AuthTestUser;
  let warehouse: AuthTestUser;
  let hrManager: AuthTestUser;
  let profileVersionId: string;
  let familyId: string;
  const extraProfileVersionIds: string[] = [];
  const extraFamilyIds: string[] = [];
  const importIds: string[] = [];
  const containerIds: string[] = [];

  beforeAll(async () => {
    configureAuthTestEnv();
    runId = randomUUID().replaceAll('-', '').slice(0, 12);
    priorStorageRoot = process.env.STORAGE_ROOT;
    storageRoot = await mkdtemp(join(tmpdir(), `pp06-storage-${runId}-`));
    fixtureDir = await mkdtemp(join(tmpdir(), `pp06-fixtures-${runId}-`));
    process.env.STORAGE_ROOT = storageRoot;

    // Use the built generated client so Jest's unit-test Prisma mapper remains
    // intact for the rest of the e2e suite while this gate reaches PostgreSQL.
    const runtimeRequire = createRequire(__filename);
    const { PrismaClient: RealPrismaClient } = runtimeRequire(
      '../dist/src/generated/prisma/client.js',
    );
    prisma = new RealPrismaClient({
      adapter: new PrismaPg(process.env.DATABASE_URL!),
    });
    await prisma.$connect();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    office = await createActor('OFFICE');
    warehouse = await createActor('WAREHOUSE');
    hrManager = await createActor('HR_MANAGER');

    familyId = `pp06-family-${runId}`;
    profileVersionId = `pp06-profile-${runId}`;
    const mapping = JSON.parse(
      await readFile(mappingFixture, 'utf8'),
    ) as Record<string, any>;
    mapping.sheet = { name: 'PP06Review' };
    mapping.profileVersion = profileVersionId;
    const fingerprint = {
      profileId: profileVersionId,
      algorithmVersion: 'workbook-fingerprint-v1',
      workbookType: 'OOXML_XLSX',
      sheet: { name: 'PP06Review' },
      anchors: [
        { value: '运单号', required: true, row: 6, column: 1 },
        { value: '箱数/件数', required: true, row: 6, column: 4 },
        { value: '体积', required: true, row: 6, column: 6 },
      ],
      requiredRelativeColumns: [
        { anchor: '运单号', header: '箱数/件数', offset: 3 },
        { anchor: '运单号', header: '体积', offset: 5 },
      ],
      dataStart: { rowOffsetFromHeader: 1 },
    };
    await prisma.parserProfileFamily.create({
      data: {
        id: familyId,
        stableName: `pp06-real-layout-${runId}`,
        customerLabel: 'PARSER-PROFILE-06 real-fixture-derived layout',
        createdById: office.id,
      },
    });
    await prisma.parserProfileVersion.create({
      data: {
        id: profileVersionId,
        familyId,
        version: 1,
        lifecycle: 'ACTIVE',
        trustState: 'REVIEW_REQUIRED',
        trustStreak: 0,
        mappingDefinition: mapping,
        fingerprintDefinition: fingerprint,
        matcherVersion: 'workbook-fingerprint-v1',
        mappingVersion: 'parser-profile-mapping-v1',
        createdById: office.id,
        approvedById: office.id,
        approvedAt: new Date(),
        approvalReason: 'E2E approved replay evidence',
        lifecycleReason: 'E2E approved replay evidence',
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const actorIds = [office?.id, warehouse?.id, hrManager?.id].filter(
        Boolean,
      );
      await prisma.parserProfileAuditEvent.deleteMany({
        where: {
          OR: [{ profileVersionId }, { actorId: { in: actorIds } }],
        },
      });
      await prisma.parserProfileEvidence.deleteMany({
        where: { profileVersionId },
      });
      await prisma.parserProfileReview.deleteMany({
        where: { profileVersionId },
      });
      if (containerIds.length) {
        await prisma.correctionFeedback.deleteMany({
          where: { containerId: { in: containerIds } },
        });
        await prisma.containerLine.deleteMany({
          where: { containerId: { in: containerIds } },
        });
        await prisma.containerDestination.deleteMany({
          where: { containerId: { in: containerIds } },
        });
        await prisma.container.deleteMany({
          where: { id: { in: containerIds } },
        });
      }
      if (importIds.length) {
        await prisma.importFile.deleteMany({
          where: { id: { in: importIds } },
        });
      }
      await prisma.parserProfileVersion.deleteMany({
        where: { id: profileVersionId },
      });
      if (extraProfileVersionIds.length) {
        await prisma.parserProfileVersion.deleteMany({
          where: { id: { in: extraProfileVersionIds } },
        });
      }
      await prisma.parserProfileFamily.deleteMany({ where: { id: familyId } });
      if (extraFamilyIds.length) {
        await prisma.parserProfileFamily.deleteMany({
          where: { id: { in: extraFamilyIds } },
        });
      }
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: actorIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: actorIds } } });
    }
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
    if (priorStorageRoot === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = priorStorageRoot;
  });

  it('keeps five distinct imports staged, resets material evidence, and promotes only on the final 3/3', async () => {
    const workbooks = Array.from({ length: 5 }, (_, index) =>
      deriveWorkbook(index + 1),
    );

    const first = await uploadAndStage(workbooks[0]);
    await assertReviewRbac(first.id);
    expect(
      await prisma.container.count({ where: { importFileId: first.id } }),
    ).toBe(0);
    expect(
      await prisma.generatedFile.count({ where: { importFileId: first.id } }),
    ).toBe(0);
    const firstAccepted = await officePost(
      `/api/imports/${first.id}/profile-review/accept`,
      { expectedRevision: 0 },
    ).expect(201);
    containerIds.push(firstAccepted.body.acceptedContainer.id);
    expect(firstAccepted.body.profile.trustStreak).toBe(1);
    await expectProfile('REVIEW_REQUIRED', 1);

    const second = await uploadAndStage(workbooks[1]);
    const secondReview = await officeGet(
      `/api/imports/${second.id}/profile-review`,
    ).expect(200);
    const stagedDestination =
      secondReview.body.canonicalResult.lines[0].destinationCode;
    const correctedLines = secondReview.body.canonicalResult.lines;
    correctedLines[0] = {
      ...correctedLines[0],
      destinationCode: 'YYC4',
    };
    const corrected = await officePost(
      `/api/imports/${second.id}/profile-review/correct`,
      {
        expectedRevision: 0,
        reason: 'Corrected destination from the preserved source row',
        canonicalResult: {
          ...secondReview.body.canonicalResult,
          lines: correctedLines,
        },
      },
    ).expect(201);
    containerIds.push(corrected.body.acceptedContainer.id);
    expect(corrected.body.status).toBe('CORRECTED');
    expect(corrected.body.canonicalResult.lines[0].destinationCode).toBe(
      stagedDestination,
    );
    expect(corrected.body.finalCanonicalResult.lines[0].destinationCode).toBe(
      'YYC4',
    );
    expect(corrected.body.correctionDiff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'destinationCode', material: true }),
      ]),
    );
    await expectProfile('REVIEW_REQUIRED', 0);
    const persistedReview = await prisma.parserProfileReview.findUniqueOrThrow({
      where: { importFileId: second.id },
      select: { stagedResult: true, finalResult: true },
    });
    expect((persistedReview.stagedResult as any).lines[0].destinationCode).toBe(
      stagedDestination,
    );
    expect((persistedReview.finalResult as any).lines[0].destinationCode).toBe(
      'YYC4',
    );

    const third = await uploadAndStage(workbooks[2]);
    await request(app.getHttpServer())
      .post('/api/imports')
      .set('Authorization', authHeaderFor(office))
      .attach('file', workbooks[2])
      .expect(409)
      .expect((response) =>
        expect(response.body.code).toBe('DUPLICATE_IMPORT'),
      );
    const thirdAccepted = await officePost(
      `/api/imports/${third.id}/profile-review/accept`,
      { expectedRevision: 0 },
    ).expect(201);
    containerIds.push(thirdAccepted.body.acceptedContainer.id);
    await expectProfile('REVIEW_REQUIRED', 1);

    const fourth = await uploadAndStage(workbooks[3]);
    const concurrent = await Promise.all([
      officePost(`/api/imports/${fourth.id}/profile-review/accept`, {
        expectedRevision: 0,
      }),
      officePost(`/api/imports/${fourth.id}/profile-review/accept`, {
        expectedRevision: 0,
      }),
    ]);
    expect(concurrent.map((response) => response.status)).toEqual([201, 201]);
    const fourthContainerId = concurrent[0].body.acceptedContainer.id;
    containerIds.push(fourthContainerId);
    expect(concurrent[1].body.acceptedContainer.id).toBe(fourthContainerId);
    expect(
      await prisma.parserProfileEvidence.count({
        where: { profileVersionId, importFileId: fourth.id },
      }),
    ).toBe(1);
    expect(
      await prisma.container.count({ where: { importFileId: fourth.id } }),
    ).toBe(1);
    await expectProfile('REVIEW_REQUIRED', 2);

    const fifth = await uploadAndStage(workbooks[4]);
    const fifthAccepted = await officePost(
      `/api/imports/${fifth.id}/profile-review/accept`,
      { expectedRevision: 0 },
    ).expect(201);
    containerIds.push(fifthAccepted.body.acceptedContainer.id);
    expect(fifthAccepted.body.profile.trustStreak).toBe(3);
    expect(fifthAccepted.body.profile.trustState).toBe('TRUSTED');
    await expectProfile('TRUSTED', 3);

    const evidence = await prisma.parserProfileEvidence.findMany({
      where: { profileVersionId },
      include: { importFile: { select: { fileSha256: true } } },
      orderBy: { reviewedAt: 'asc' },
    });
    expect(
      new Set(evidence.map((item) => item.importFile.fileSha256)).size,
    ).toBe(5);
    expect(evidence.map((item) => item.streakAfter)).toEqual([1, 0, 1, 2, 3]);
    expect(evidence.map((item) => item.outcome)).toEqual([
      'ACCEPTED',
      'MATERIAL_CORRECTION',
      'ACCEPTED',
      'ACCEPTED',
      'ACCEPTED',
    ]);

    const detail = await officeGet(
      `/api/parser-profiles/versions/${profileVersionId}`,
    ).expect(200);
    expect(detail.body.evidenceTimeline).toHaveLength(5);
    expect(detail.body.evidenceTimeline[4]).toMatchObject({
      importFileShortSha: expect.stringMatching(/^[a-f0-9]{12}$/),
      streakAfter: 3,
      outcome: 'ACCEPTED',
    });
    expect(JSON.stringify(detail.body)).not.toContain(storageRoot);
  });

  it('auto-commits trusted matches idempotently, revokes trust on material correction, and blocks collision or drift', async () => {
    await prisma.parserProfileVersion.update({
      where: { id: profileVersionId },
      data: {
        lifecycle: 'ACTIVE',
        trustState: 'TRUSTED',
        trustStreak: 3,
        lifecycleRevision: { increment: 1 },
      },
    });

    const trustedWorkbook = deriveWorkbook(6);
    const trustedUpload = await upload(trustedWorkbook);
    const trustedParse = await officePost(
      `/api/imports/${trustedUpload.id}/parse`,
      {},
    ).expect(201);
    expect(trustedParse.body.importFile).toMatchObject({
      parseStatus: expect.stringMatching(/^(PARSED|WARNING)$/),
      parseSelection: {
        source: 'TRUSTED_PROFILE',
        reasonCode: 'PARSER_PROFILE_UNIQUE_TRUSTED_MATCH',
        autoCommitted: true,
        profile: { id: profileVersionId, version: 1 },
      },
    });
    expect(trustedParse.body.containers).toHaveLength(1);
    const trustedContainerId = trustedParse.body.containers[0].id;
    containerIds.push(trustedContainerId);
    const trustedContainer = await prisma.container.findUniqueOrThrow({
      where: { id: trustedContainerId },
      include: { destinations: true },
    });
    expect(trustedContainer).toMatchObject({
      parserSourceKind: 'PROFILE',
      parserProfileVersionId: profileVersionId,
    });
    expect(trustedContainer.destinations.length).toBeGreaterThan(0);
    expect(trustedContainer.destinations[0].finalPallets).toBeGreaterThan(0);

    await officePost(`/api/imports/${trustedUpload.id}/parse`, {}).expect(201);
    expect(
      await prisma.container.count({
        where: { importFileId: trustedUpload.id },
      }),
    ).toBe(1);
    expect(
      await prisma.parserProfileAuditEvent.count({
        where: {
          importFileId: trustedUpload.id,
          eventCode: 'TRUSTED_AUTO_COMMITTED',
        },
      }),
    ).toBe(1);

    const destination = trustedContainer.destinations[0];
    await request(app.getHttpServer())
      .patch(`/api/container-destinations/${destination.id}`)
      .set('Authorization', authHeaderFor(office))
      .send({
        destinationCode: `${destination.destinationCode}-CORRECTED`,
        reason: 'E2E material parser correction',
      })
      .expect(200);
    await expectProfile('REVIEW_REQUIRED', 0);
    expect(
      await prisma.parserProfileAuditEvent.count({
        where: {
          importFileId: trustedUpload.id,
          eventCode: 'TRUST_REVOKED_BY_MATERIAL_CORRECTION',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.container.count({ where: { id: trustedContainerId } }),
    ).toBe(1);

    const postDemotion = await uploadAndStage(deriveWorkbook(7));
    expect(
      await prisma.container.count({
        where: { importFileId: postDemotion.id },
      }),
    ).toBe(0);

    await prisma.parserProfileVersion.update({
      where: { id: profileVersionId },
      data: {
        trustState: 'TRUSTED',
        trustStreak: 3,
        lifecycleRevision: { increment: 1 },
      },
    });
    const collisionFamilyId = `pp07-collision-family-${runId}`;
    const collisionProfileId = `pp07-collision-profile-${runId}`;
    extraFamilyIds.push(collisionFamilyId);
    extraProfileVersionIds.push(collisionProfileId);
    const sourceProfile = await prisma.parserProfileVersion.findUniqueOrThrow({
      where: { id: profileVersionId },
    });
    await prisma.parserProfileFamily.create({
      data: {
        id: collisionFamilyId,
        stableName: `pp07-collision-${runId}`,
        createdById: office.id,
      },
    });
    await prisma.parserProfileVersion.create({
      data: {
        id: collisionProfileId,
        familyId: collisionFamilyId,
        version: 1,
        lifecycle: 'ACTIVE',
        trustState: 'TRUSTED',
        trustStreak: 3,
        mappingDefinition: sourceProfile.mappingDefinition,
        fingerprintDefinition: sourceProfile.fingerprintDefinition,
        matcherVersion: sourceProfile.matcherVersion,
        mappingVersion: sourceProfile.mappingVersion,
        createdById: office.id,
        approvedById: office.id,
        approvedAt: new Date(),
        approvalReason: 'E2E collision',
        lifecycleReason: 'E2E collision',
      },
    });
    const collisionUpload = await upload(deriveWorkbook(8));
    const collisionParse = await officePost(
      `/api/imports/${collisionUpload.id}/parse`,
      {},
    ).expect(201);
    expect(collisionParse.body.importFile).toMatchObject({
      parseStatus: 'REVIEW_REQUIRED',
      parseSelection: {
        source: 'AMBIGUOUS',
        reasonCode: 'FINGERPRINT_PROFILE_COLLISION',
        autoCommitted: false,
      },
    });
    expect(collisionParse.body.containers).toEqual([]);

    await prisma.parserProfileVersion.update({
      where: { id: collisionProfileId },
      data: { lifecycle: 'PAUSED', lifecycleRevision: { increment: 1 } },
    });
    const driftUpload = await upload(deriveWorkbook(9, true));
    const driftParse = await officePost(
      `/api/imports/${driftUpload.id}/parse`,
      {},
    ).expect(201);
    expect(driftParse.body.importFile).toMatchObject({
      parseStatus: 'REVIEW_REQUIRED',
      parseSelection: {
        source: 'DRIFT',
        reasonCode: 'FINGERPRINT_STRUCTURAL_DRIFT',
        autoCommitted: false,
      },
    });
    expect(driftParse.body.containers).toEqual([]);

    await prisma.parserProfileVersion.update({
      where: { id: profileVersionId },
      data: { lifecycle: 'PAUSED', lifecycleRevision: { increment: 1 } },
    });
    const pausedUpload = await upload(deriveWorkbook(10));
    const pausedParse = await officePost(
      `/api/imports/${pausedUpload.id}/parse`,
      {},
    ).expect(201);
    expect(pausedParse.body.importFile.parseSelection).toMatchObject({
      source: 'BUILT_IN',
      reasonCode: 'PARSER_SELECTION_NO_ACTIVE_PROFILE',
      autoCommitted: false,
    });
    expect(
      pausedParse.body.containers.every(
        (container: { parserSourceKind?: string }) =>
          container.parserSourceKind !== 'PROFILE',
      ),
    ).toBe(true);
  });

  function deriveWorkbook(index: number, drift = false): string {
    const target = join(fixtureDir, `pp06-${index}.xlsx`);
    const script = [
      'from openpyxl import load_workbook',
      'import sys',
      'source,target,container_no,suffix=sys.argv[1:]',
      'book=load_workbook(source)',
      'sheet=book["Sheet1"]',
      'sheet.title="PP06Review"',
      'sheet["B3"]=container_no',
      "sheet['A7']='{}-PP06-{}'.format(sheet['A7'].value,suffix)",
      drift ? "sheet['A6']='运单号-DRIFT'" : 'pass',
      'book.save(target)',
      'book.close()',
    ].join(';');
    execFileSync(
      'uv',
      [
        'run',
        'python',
        '-c',
        script,
        sourceFixture,
        target,
        `PP${String.fromCharCode(64 + index)}A123456${index}`,
        String(index),
      ],
      { cwd: workerDir },
    );
    return target;
  }

  async function uploadAndStage(workbook: string): Promise<{ id: string }> {
    const uploaded = await upload(workbook);
    const parsed = await officePost(
      `/api/imports/${uploaded.id}/parse`,
      {},
    ).expect(201);
    expect(parsed.body.importFile.parseStatus).toBe('REVIEW_REQUIRED');
    expect(parsed.body.containers).toEqual([]);
    const review = await officeGet(
      `/api/imports/${uploaded.id}/profile-review`,
    ).expect(200);
    expect(review.body).toMatchObject({
      sourceFileShortSha: expect.stringMatching(/^[a-f0-9]{12}$/),
      status: 'PENDING',
      profile: {
        id: profileVersionId,
        trustState: 'REVIEW_REQUIRED',
      },
    });
    expect(review.body).not.toHaveProperty('storedPath');
    return uploaded;
  }

  async function upload(workbook: string): Promise<{ id: string }> {
    const uploaded = await request(app.getHttpServer())
      .post('/api/imports')
      .set('Authorization', authHeaderFor(office))
      .attach('file', workbook)
      .expect(201);
    importIds.push(uploaded.body.id);
    return { id: uploaded.body.id };
  }

  async function assertReviewRbac(importFileId: string): Promise<void> {
    for (const actor of [warehouse, hrManager]) {
      await request(app.getHttpServer())
        .get(`/api/imports/${importFileId}/profile-review`)
        .set('Authorization', authHeaderFor(actor))
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/imports/${importFileId}/profile-review/accept`)
        .set('Authorization', authHeaderFor(actor))
        .send({ expectedRevision: 0 })
        .expect(403);
    }
  }

  async function expectProfile(
    trustState: 'REVIEW_REQUIRED' | 'TRUSTED',
    trustStreak: number,
  ): Promise<void> {
    await expect(
      prisma.parserProfileVersion.findUnique({
        where: { id: profileVersionId },
        select: { trustState: true, trustStreak: true },
      }),
    ).resolves.toEqual({ trustState, trustStreak });
  }

  function officePost(url: string, body: string | object | undefined) {
    return request(app.getHttpServer())
      .post(url)
      .set('Authorization', authHeaderFor(office))
      .send(body);
  }

  function officeGet(url: string) {
    return request(app.getHttpServer())
      .get(url)
      .set('Authorization', authHeaderFor(office));
  }

  async function createActor(
    roleCode: 'OFFICE' | 'WAREHOUSE' | 'HR_MANAGER',
  ): Promise<AuthTestUser> {
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: roleCode },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
    const id = `pp06-${roleCode.toLowerCase()}-${runId}`;
    const email = `${id}@example.invalid`;
    await prisma.user.create({
      data: {
        id,
        email,
        name: `${roleCode} PP06`,
        role: roleCode === 'HR_MANAGER' ? 'OFFICE' : roleCode,
        isActive: true,
        roleAssignments: {
          create: { id: `${id}-role`, roleId: role.id },
        },
      },
    });
    return {
      id,
      email,
      name: `${roleCode} PP06`,
      role: roleCode,
      isActive: true,
      roleAssignments: [
        {
          role: {
            code: roleCode,
            isActive: true,
            permissions: role.permissions.map((item) => ({
              permission: { code: item.permission.code },
            })),
          },
        },
      ],
    };
  }
});
