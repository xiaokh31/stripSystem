import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AsyncJobsService } from './../src/async-jobs/async-jobs.service';
import { ParserLearningCasesService } from './../src/parser-learning-cases/parser-learning-cases.service';
import { ParserProfileWorkerService } from './../src/parser-learning-cases/parser-profile-worker.service';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  adminAuthHeader,
  configureAuthTestEnv,
  hrManagerAuthHeader,
  installAuthMock,
  officeAuthHeader,
  warehouseAuthHeader,
} from './auth-test-helpers';

describe('ParserLearningCasesController replay vertical slice (e2e)', () => {
  jest.setTimeout(30_000);

  const sourceFixture = resolve(
    __dirname,
    '..',
    '..',
    '..',
    'samples',
    'unloading-plans',
    'CAAU8011090 UNLOADING PLAN.xlsx',
  );
  const definitionFixture = resolve(
    __dirname,
    '..',
    '..',
    'worker-python',
    'tests',
    'fixtures',
    'parser_profiles',
    'unloading-plan-sheet1-v1.json',
  );

  let app: INestApplication<App>;
  let storageRoot: string;
  let originalStorageRoot: string | undefined;
  let prisma: ReturnType<typeof createPrismaMock>;
  let asyncJobs: ReturnType<typeof createAsyncJobsMock>;
  let mappingDefinition: Record<string, unknown>;

  beforeEach(async () => {
    configureAuthTestEnv();
    originalStorageRoot = process.env.STORAGE_ROOT;
    storageRoot = await mkdtemp(join(tmpdir(), 'parser-profile-e2e-'));
    process.env.STORAGE_ROOT = storageRoot;
    const storedPath = join(
      storageRoot,
      'original_files',
      basename(sourceFixture),
    );
    await mkdir(join(storageRoot, 'original_files'), { recursive: true });
    await copyFile(sourceFixture, storedPath);
    const sourceBytes = await readFile(storedPath);
    const sourceFileSha256 = createHash('sha256')
      .update(sourceBytes)
      .digest('hex');
    mappingDefinition = JSON.parse(
      await readFile(definitionFixture, 'utf8'),
    ) as Record<string, unknown>;
    mappingDefinition = {
      ...mappingDefinition,
      fields: {
        ...(mappingDefinition.fields as Record<string, unknown>),
        packageType: {
          sources: [{ kind: 'constant', value: 'CARTON' }],
        },
      },
    };
    prisma = createPrismaMock({ storedPath, sourceFileSha256 });
    installAuthMock(prisma);
    asyncJobs = createAsyncJobsMock();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AsyncJobsService)
      .useValue(asyncJobs)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    await rm(storageRoot, { recursive: true, force: true });
    if (originalStorageRoot === undefined) {
      delete process.env.STORAGE_ROOT;
    } else {
      process.env.STORAGE_ROOT = originalStorageRoot;
    }
  });

  it('inspects real bytes, guards drafts, previews, replays, downloads, and submits only a DRAFT candidate', async () => {
    const originalManualState = JSON.stringify(prisma.state.containers[0]);
    const created = await officePost('/api/parser-learning-cases', {
      importFileId: 'import-failed-1',
    }).expect(201);
    const caseId = created.body.id as string;

    await officePost(`/api/parser-learning-cases/${caseId}/link-container`, {
      containerId: 'manual-container-1',
    }).expect(201);

    await request(app.getHttpServer())
      .post(`/api/parser-learning-cases/${caseId}/inspect`)
      .set('Authorization', warehouseAuthHeader())
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/parser-learning-cases/${caseId}/inspect`)
      .set('Authorization', hrManagerAuthHeader())
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/parser-learning-cases?status=OPEN')
      .set('Authorization', warehouseAuthHeader())
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/parser-learning-cases?status=OPEN')
      .set('Authorization', adminAuthHeader())
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/parser-learning-cases/${caseId}/inspect`)
      .set('Authorization', adminAuthHeader())
      .send({})
      .expect(201);
    const inspection = await officePost(
      `/api/parser-learning-cases/${caseId}/inspect`,
      {},
    ).expect(201);
    expect(inspection.body).toMatchObject({
      caseId,
      draftRevision: 0,
      workerVersion: 'parser-profile-engine-v1',
      source: {
        importFileId: 'import-failed-1',
        fileSha256: prisma.state.importFile.fileSha256,
      },
    });
    expect(inspection.body).not.toHaveProperty('source.storedPath');
    expect(
      inspection.body.inspection.sheets[0].sampleCells.length,
    ).toBeLessThanOrEqual(500);

    const fingerprintDefinition = validFingerprintDefinition();
    const draft = await officePut(
      `/api/parser-learning-cases/${caseId}/draft`,
      {
        expectedRevision: 0,
        mappingDefinition,
        fingerprintDefinition,
      },
    ).expect(200);
    expect(draft.body).toMatchObject({
      draftRevision: 1,
      status: 'READY_FOR_REPLAY',
    });
    const reloadedDraft = await request(app.getHttpServer())
      .get(`/api/parser-learning-cases/${caseId}`)
      .set('Authorization', officeAuthHeader())
      .expect(200);
    expect(reloadedDraft.body).toMatchObject({
      id: caseId,
      draftRevision: 1,
      status: 'READY_FOR_REPLAY',
      draftDefinition: {
        mappingDefinition,
        fingerprintDefinition,
        mappingSchemaVersion: 'parser-profile-mapping-v1',
        fingerprintVersion: 'workbook-fingerprint-v1',
        workerVersion: 'parser-profile-engine-v1',
      },
    });
    await officePut(`/api/parser-learning-cases/${caseId}/draft`, {
      expectedRevision: 0,
      mappingDefinition,
      fingerprintDefinition,
    })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('PROFILE_DRAFT_REVISION_CONFLICT');
      });

    const preview = await officePost(
      `/api/parser-learning-cases/${caseId}/preview`,
      { revision: 1 },
    ).expect(201);
    expect(preview.body).toMatchObject({
      caseId,
      draftRevision: 1,
      totalRows: 43,
      pinned: {
        sourceFileSha256: prisma.state.importFile.fileSha256,
        mappingSchemaVersion: 'parser-profile-mapping-v1',
        workerVersion: 'parser-profile-engine-v1',
      },
    });
    expect(preview.body.sampleRows.length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(prisma.state.containers[0])).toBe(
      originalManualState,
    );

    const queued = await officePost(
      `/api/parser-learning-cases/${caseId}/replay`,
      { revision: 1, idempotencyKey: 'replay-request-0001' },
    ).expect(201);
    const retried = await officePost(
      `/api/parser-learning-cases/${caseId}/replay`,
      { revision: 1, idempotencyKey: 'replay-request-0001' },
    ).expect(201);
    expect(retried.body.id).toBe(queued.body.id);

    const service = app.get(ParserLearningCasesService);
    const replay = (await service.executeReplayJob(
      caseId,
      officeActor(),
      queued.body.id,
      asyncJobs.state.jobs[0].metadata,
    )) as any;
    expect(replay.replay).toMatchObject({
      draftRevision: 1,
      passed: true,
      stale: false,
      diffSummary: { materialDifferences: 0, blockers: 0 },
    });
    expect(JSON.stringify(prisma.state.containers[0])).toBe(
      originalManualState,
    );
    const worker = app.get(ParserProfileWorkerService);
    const executeMapping = jest.spyOn(worker, 'executeMapping');
    const replayRetry = (await service.executeReplayJob(
      caseId,
      officeActor(),
      queued.body.id,
      asyncJobs.state.jobs[0].metadata,
    )) as any;
    expect(replayRetry.replay).toMatchObject({
      artifactId: replay.replay.artifactId,
      idempotent: true,
    });
    expect(executeMapping).not.toHaveBeenCalled();
    expect(prisma.state.generatedFiles).toHaveLength(1);

    const artifacts = await request(app.getHttpServer())
      .get(`/api/parser-learning-cases/${caseId}/replays`)
      .set('Authorization', officeAuthHeader())
      .expect(200);
    expect(artifacts.body.items).toHaveLength(1);
    expect(artifacts.body.items[0]).not.toHaveProperty('storagePath');
    const artifactId = artifacts.body.items[0].id as string;
    const downloaded = await request(app.getHttpServer())
      .get(
        `/api/parser-learning-cases/${caseId}/replays/${artifactId}/download`,
      )
      .set('Authorization', officeAuthHeader())
      .expect(200);
    const artifact = downloaded.body;
    expect(artifact).toMatchObject({
      contractVersion: 'parser-profile-replay-v1',
      caseId,
      draftRevision: 1,
      passed: true,
    });

    const submitted = await officePost(
      `/api/parser-learning-cases/${caseId}/submit`,
      {
        revision: 1,
        replayArtifactId: artifactId,
        stableName: 'customer-layout-a',
        customerLabel: 'Source Header Value',
      },
    ).expect(201);
    expect(submitted.body).toMatchObject({
      learningCase: { status: 'AWAITING_COMPLETION' },
      profileVersion: {
        lifecycle: 'DRAFT',
        trustState: 'REVIEW_REQUIRED',
        sourceDraftRevision: 1,
      },
    });
    expect(prisma.state.profileVersions).toHaveLength(1);
    expect(prisma.state.profileVersions[0]).not.toMatchObject({
      lifecycle: 'ACTIVE',
      trustState: 'TRUSTED',
    });

    prisma.state.containers[0].status = 'UNLOADED';
    const catchUp = await officePost(
      `/api/parser-learning-cases/${caseId}/completion/catch-up`,
      {},
    ).expect(201);
    expect(catchUp.body.completion).toMatchObject({
      learningCaseId: caseId,
      snapshotCreated: true,
      warningCodes: [],
    });
    const completionJob = prisma.state.asyncJobRows[0];
    expect(completionJob).toMatchObject({
      jobType: 'PARSER_PROFILE_REPLAY',
      parserLearningCaseId: caseId,
    });
    await service.executeReplayJob(
      caseId,
      officeActor(),
      completionJob.id,
      completionJob.metadata,
    );
    completionJob.status = 'SUCCEEDED';
    completionJob.finishedAt = new Date('2026-07-18T12:05:00.000Z');

    const profileId = submitted.body.profileVersion.id as string;
    const detail = await request(app.getHttpServer())
      .get(`/api/parser-profiles/versions/${profileId}`)
      .set('Authorization', officeAuthHeader())
      .expect(200);
    expect(detail.body).toMatchObject({
      lifecycle: 'DRAFT',
      trustState: 'REVIEW_REQUIRED',
      trustStreak: 0,
      approvalEligibility: { eligible: true, codes: [] },
      replay: { passed: true },
    });

    await request(app.getHttpServer())
      .post(`/api/parser-profiles/versions/${profileId}/approve`)
      .set('Authorization', officeAuthHeader())
      .send({
        expectedRevision: 0,
        replayId: detail.body.replay.replayId,
        reason: 'Office must not approve',
      })
      .expect(403);

    const approved = await request(app.getHttpServer())
      .post(`/api/parser-profiles/versions/${profileId}/approve`)
      .set('Authorization', adminAuthHeader())
      .send({
        expectedRevision: 0,
        replayId: detail.body.replay.replayId,
        reason: 'Admin reviewed frozen completion evidence',
      })
      .expect(201);
    expect(approved.body).toMatchObject({
      lifecycle: 'ACTIVE',
      trustState: 'REVIEW_REQUIRED',
      trustStreak: 0,
      approvedBy: { id: 'auth-admin' },
    });
  });

  it('keeps completed warehouse truth when the completion replay worker fails', async () => {
    const created = await officePost('/api/parser-learning-cases', {
      importFileId: 'import-failed-1',
    }).expect(201);
    const caseId = created.body.id as string;
    await officePost(`/api/parser-learning-cases/${caseId}/link-container`, {
      containerId: 'manual-container-1',
    }).expect(201);
    await officePut(`/api/parser-learning-cases/${caseId}/draft`, {
      expectedRevision: 0,
      mappingDefinition,
      fingerprintDefinition: validFingerprintDefinition(),
    }).expect(200);

    const initialReplay = (await app
      .get(ParserLearningCasesService)
      .executeReplayJob(caseId, officeActor(), 'job-initial-replay', {
        draftRevision: 1,
        replayIdempotencyKey: 'initial-replay-0001',
      })) as { replay: { artifactId: string } };
    await officePost(`/api/parser-learning-cases/${caseId}/submit`, {
      revision: 1,
      replayArtifactId: initialReplay.replay.artifactId,
      stableName: 'customer-layout-worker-failure',
      customerLabel: 'Worker failure evidence',
    }).expect(201);
    prisma.state.containers[0].status = 'UNLOADED';
    const completedWarehouseTruth = JSON.stringify(prisma.state.containers[0]);
    const catchUp = await officePost(
      `/api/parser-learning-cases/${caseId}/completion/catch-up`,
      {},
    ).expect(201);
    const completionJobId = catchUp.body.completion.replayJobId as string;

    const worker = app.get(ParserProfileWorkerService);
    jest.spyOn(worker, 'executeMapping').mockRejectedValueOnce(
      Object.assign(new Error('worker failed'), {
        getResponse: () => ({ code: 'PROFILE_WORKER_INVOCATION_FAILED' }),
      }),
    );
    await expect(
      app
        .get(ParserLearningCasesService)
        .executeReplayJob(caseId, officeActor(), completionJobId, {
          draftRevision: 1,
          replayIdempotencyKey:
            prisma.state.asyncJobRows.at(-1).metadata.replayIdempotencyKey,
        }),
    ).rejects.toThrow('worker failed');

    expect(prisma.state.learningCases[0]).toMatchObject({
      status: 'REPLAY_FAILED',
      lastErrorCode: 'PROFILE_WORKER_INVOCATION_FAILED',
      activeReplayToken: null,
      completionSnapshot: expect.objectContaining({
        contractVersion: 'parser-completion-snapshot-v1',
      }),
    });
    expect(prisma.state.generatedFiles.at(-1)).toMatchObject({
      status: 'FAILED',
      errorMessage: 'PROFILE_WORKER_INVOCATION_FAILED',
    });
    expect(JSON.stringify(prisma.state.containers[0])).toBe(
      completedWarehouseTruth,
    );
  });

  it('does not let an older replay failure clear a newer active replay token', async () => {
    const created = await officePost('/api/parser-learning-cases', {
      importFileId: 'import-failed-1',
    }).expect(201);
    const caseId = created.body.id as string;
    await officePost(`/api/parser-learning-cases/${caseId}/link-container`, {
      containerId: 'manual-container-1',
    }).expect(201);
    await officePut(`/api/parser-learning-cases/${caseId}/draft`, {
      expectedRevision: 0,
      mappingDefinition,
      fingerprintDefinition: validFingerprintDefinition(),
    }).expect(200);
    prisma.state.learningCases[0].activeReplayToken = 'newer-replay-token';

    await expect(
      app
        .get(ParserLearningCasesService)
        .executeReplayJob(caseId, officeActor(), 'job-older', {
          draftRevision: 1,
          replayIdempotencyKey: 'older-replay-0001',
        }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PARSER_LEARNING_CASE_REPLAY_RUNNING',
      }),
    });

    expect(prisma.state.learningCases[0]).toMatchObject({
      status: 'READY_FOR_REPLAY',
      activeReplayToken: 'newer-replay-token',
      lastErrorCode: null,
    });
  });

  function officePost(url: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(url)
      .set('Authorization', officeAuthHeader())
      .send(body);
  }

  function officePut(url: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .put(url)
      .set('Authorization', officeAuthHeader())
      .send(body);
  }
});

function createPrismaMock(input: {
  storedPath: string;
  sourceFileSha256: string;
}) {
  const now = new Date('2026-07-18T12:00:00.000Z');
  const state: any = {
    importFile: {
      id: 'import-failed-1',
      originalFilename: basename(input.storedPath),
      storedPath: input.storedPath,
      fileSha256: input.sourceFileSha256,
      format: 'UNKNOWN',
      parseStatus: 'ERROR',
      rawMetadata: { detectorCode: 'UNSUPPORTED_FORMAT' },
      deletedAt: null,
    },
    containers: [manualContainer(now)],
    learningCases: [],
    generatedFiles: [],
    profileFamilies: [],
    profileVersions: [],
    asyncJobRows: [],
    auditEvents: [],
  };
  const prisma: any = {
    state,
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'locked' }]),
    importFile: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(
          where.id === state.importFile.id && where.deletedAt === null
            ? state.importFile
            : null,
        ),
      ),
    },
    container: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(
          state.containers.find((item: any) => item.id === where.id) ?? null,
        ),
      ),
    },
    parserLearningCase: {
      findUnique: jest.fn(({ where }: any) => {
        const record = state.learningCases.find((item: any) =>
          where.id
            ? item.id === where.id
            : where.sourceImportId
              ? item.sourceImportId === where.sourceImportId
              : item.linkedContainerId === where.linkedContainerId,
        );
        return Promise.resolve(record ? caseResponse(state, record) : null);
      }),
      findMany: jest.fn(({ where, take, skip }: any) =>
        Promise.resolve(
          state.learningCases
            .filter(
              (item: any) => !where?.status || item.status === where.status,
            )
            .slice(skip, skip + take)
            .map((item: any) => caseResponse(state, item)),
        ),
      ),
      create: jest.fn(({ data }: any) => {
        const record = {
          id: `learning-case-${state.learningCases.length + 1}`,
          ...data,
          draftRevision: 0,
          draftDefinition: null,
          completionSnapshot: null,
          completionSnapshotAt: null,
          completionReplayJobId: null,
          replaySummary: null,
          activeReplayToken: null,
          lastErrorCode: null,
          linkedContainerId: null,
          closedById: null,
          closedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        state.learningCases.push(record);
        return Promise.resolve(caseResponse(state, record));
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        const record = state.learningCases.find(
          (item: any) => item.id === where.id && matchesWhere(item, where),
        );
        if (!record) return Promise.resolve({ count: 0 });
        Object.assign(record, data, { updatedAt: now });
        return Promise.resolve({ count: 1 });
      }),
      update: jest.fn(({ where, data }: any) => {
        const record = state.learningCases.find(
          (item: any) => item.id === where.id,
        );
        if (!record) throw new Error('learning case missing');
        Object.assign(record, data, { updatedAt: now });
        return Promise.resolve(caseResponse(state, record));
      }),
    },
    parserProfileEvidence: { findFirst: jest.fn().mockResolvedValue(null) },
    correctionFeedback: { findMany: jest.fn().mockResolvedValue([]) },
    asyncJob: {
      create: jest.fn(({ data }: any) => {
        const record = {
          ...data,
          attempts: 0,
          result: null,
          lastError: null,
          bullJobId: null,
          queuedAt: now,
          startedAt: null,
          finishedAt: null,
          cancelledAt: null,
          createdAt: now,
          updatedAt: now,
        };
        state.asyncJobRows.push(record);
        return Promise.resolve(record);
      }),
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(
          state.asyncJobRows.find((item: any) => item.id === where.id) ?? null,
        ),
      ),
      update: jest.fn(({ where, data }: any) => {
        const record = state.asyncJobRows.find((item: any) => item.id === where.id);
        if (!record) throw new Error('async job missing');
        Object.assign(record, data, { updatedAt: now });
        return Promise.resolve(record);
      }),
    },
    parserProfileAuditEvent: {
      create: jest.fn(({ data }: any) => {
        state.auditEvents.push(data);
        return Promise.resolve({
          id: `audit-${state.auditEvents.length}`,
          ...data,
        });
      }),
      createMany: jest.fn(({ data }: any) => {
        state.auditEvents.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
    generatedFile: {
      upsert: jest.fn(({ where, update, create }: any) => {
        let record = state.generatedFiles.find(
          (item: any) => item.idempotencyKey === where.idempotencyKey,
        );
        if (record) Object.assign(record, update, { updatedAt: now });
        else {
          record = {
            ...create,
            fileSha256: null,
            fileSizeBytes: null,
            errorMessage: null,
            createdAt: now,
            updatedAt: now,
          };
          state.generatedFiles.push(record);
        }
        return Promise.resolve(record);
      }),
      update: jest.fn(({ where, data }: any) => {
        const record = state.generatedFiles.find(
          (item: any) => item.id === where.id,
        );
        if (!record) throw new Error('generated file missing');
        Object.assign(record, data, { updatedAt: now });
        return Promise.resolve(record);
      }),
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          state.generatedFiles.find((item: any) => matchesWhere(item, where)) ??
            null,
        ),
      ),
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          state.generatedFiles.filter((item: any) => matchesWhere(item, where)),
        ),
      ),
    },
    parserProfileFamily: {
      upsert: jest.fn(({ where, create }: any) => {
        let family = state.profileFamilies.find(
          (item: any) => item.stableName === where.stableName,
        );
        if (!family) {
          family = {
            id: `family-${state.profileFamilies.length + 1}`,
            ...create,
          };
          state.profileFamilies.push(family);
        }
        return Promise.resolve(family);
      }),
    },
    parserProfileVersion: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          state.profileVersions.find((item: any) =>
            matchesWhere(item, where),
          ) ?? null,
        ),
      ),
      create: jest.fn(({ data }: any) => {
        const family = state.profileFamilies.find(
          (item: any) => item.id === data.familyId,
        );
        const record = {
          id: `version-${state.profileVersions.length + 1}`,
          ...data,
          family,
          lifecycleRevision: 0,
          trustStreak: 0,
          approvalReason: null,
          lifecycleReason: null,
          approvedById: null,
          approvedBy: null,
          createdBy: {
            id: data.createdById,
            name: 'Office User',
            email: 'office@example.com',
          },
          createdAt: now,
          updatedAt: now,
        };
        state.profileVersions.push(record);
        return Promise.resolve(record);
      }),
      findUnique: jest.fn(({ where }: any) => {
        const found = state.profileVersions.find((item: any) => item.id === where.id);
        return Promise.resolve(found ? governanceResponse(state, found) : null);
      }),
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          state.profileVersions
            .filter((item: any) => !where?.lifecycle || item.lifecycle === where.lifecycle)
            .filter((item: any) => !where?.id?.not || item.id !== where.id)
            .map((item: any) => governanceResponse(state, item)),
        ),
      ),
      updateMany: jest.fn(({ where, data }: any) => {
        const found = state.profileVersions.find(
          (item: any) => item.id === where.id && matchesWhere(item, where),
        );
        if (!found) return Promise.resolve({ count: 0 });
        applyUpdate(found, data, now);
        return Promise.resolve({ count: 1 });
      }),
      update: jest.fn(({ where, data }: any) => {
        const found = state.profileVersions.find((item: any) => item.id === where.id);
        if (!found) throw new Error('profile missing');
        applyUpdate(found, data, now);
        return Promise.resolve(found);
      }),
    },
  };
  prisma.$transaction = jest.fn((callback: any) => callback(prisma));
  return prisma;
}

function caseResponse(state: any, record: any) {
  const linkedContainer = state.containers.find(
    (item: any) => item.id === record.linkedContainerId,
  );
  return {
    ...record,
    sourceImport: record.sourceImportId ? state.importFile : null,
    linkedContainer: linkedContainer ?? null,
    profileVersions: state.profileVersions
      .filter((item: any) => item.sourceLearningCaseId === record.id)
      .slice(-1),
  };
}

function governanceResponse(state: any, record: any) {
  const learningCase = state.learningCases.find(
    (item: any) => item.id === record.sourceLearningCaseId,
  );
  return {
    ...record,
    family: state.profileFamilies.find((item: any) => item.id === record.familyId),
    approvedBy: record.approvedById
      ? { id: record.approvedById, name: 'Admin User', email: 'admin@example.com' }
      : null,
    auditEvents: state.auditEvents
      .filter((item: any) => item.profileVersionId === record.id)
      .slice(-1)
      .map((item: any) => ({
        ...item,
        actor: {
          id: item.actorId,
          name: item.actorId === 'auth-admin' ? 'Admin User' : 'Office User',
          email:
            item.actorId === 'auth-admin'
              ? 'admin@example.com'
              : 'office@example.com',
        },
        occurredAt: governanceEventTimestamp(),
      })),
    sourceLearningCase: learningCase
      ? {
          ...caseResponse(state, learningCase),
          completionReplayJob: state.asyncJobRows.find(
            (item: any) => item.id === learningCase.completionReplayJobId,
          ) ?? null,
        }
      : null,
  };
}

function governanceEventTimestamp() {
  return new Date('2026-07-18T12:00:00.000Z');
}

function matchesWhere(record: any, where: any): boolean {
  return Object.entries(where).every(([key, expected]: [string, any]) => {
    if (key === 'OR' && Array.isArray(expected)) {
      return expected.some((branch) => matchesWhere(record, branch));
    }
    if (key === 'status' && expected && typeof expected === 'object') {
      return expected.not === undefined || record.status !== expected.not;
    }
    if (expected && typeof expected === 'object' && 'not' in expected) {
      return record[key] !== expected.not;
    }
    if (expected && typeof expected === 'object' && 'equals' in expected) {
      if (key === 'completionSnapshot') return record[key] === null;
      return expected.equals === null
        ? record[key] === null
        : record[key] === expected.equals;
    }
    return record[key] === expected;
  });
}

function applyUpdate(record: any, data: any, now: Date) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) {
      record[key] = Number(record[key] ?? 0) + Number((value as any).increment);
    } else {
      record[key] = value;
    }
  }
  record.updatedAt = now;
}

function manualContainer(now: Date) {
  const destinations = [
    ['YEG1', 115, '7.200'],
    ['YVR2', 8, '0.442'],
    ['Private Address / QDCA2605058915', 4, '1.188'],
    ['Private Address / SZCA2604054725', 81, '6.026'],
    ['贵司卡尔加里仓', 22, '0.887'],
    ['YYC4', 218, '15.962'],
    ['YEG2', 130, '13.236'],
    ['YVR3', 107, '11.094'],
    ['YVR4', 211, '16.133'],
  ].map(([destinationCode, cartons, volume], index) => ({
    id: `manual-destination-${index + 1}`,
    destinationCode,
    destinationType: null,
    packageType: 'CARTON',
    cartons,
    volume,
    manualPallets: 99,
    finalPallets: 99,
    note: 'not parser relevant',
    updatedAt: now,
  }));
  return {
    id: 'manual-container-1',
    containerNo: 'CAAU8011090',
    importFileId: null,
    parserSourceKind: 'MANUAL',
    parserVersion: 'manual-entry-v1',
    sourceFormat: 'UNKNOWN',
    rawJson: { source: 'manual-unloading-report' },
    status: 'CORRECTED',
    dockNo: 'DOCK-IGNORED',
    destinations,
    lines: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createAsyncJobsMock() {
  const state: any = { jobs: [] };
  return {
    state,
    isEnabled: () => false,
    getQueueName: () => 'bestar-async-jobs',
    onModuleDestroy: jest.fn(),
    submitJob: jest.fn((input: any) => {
      const key = `${input.targetId}:${input.idempotencyScope}`;
      let job = state.jobs.find((item: any) => item.key === key);
      if (!job) {
        job = {
          key,
          id: `job-${state.jobs.length + 1}`,
          jobType: input.jobType,
          status: 'QUEUED',
          parserLearningCaseId: input.parserLearningCaseId,
          attempts: 0,
          maxAttempts: input.maxAttempts,
          result: null,
          metadata: input.metadata,
          queuedAt: new Date('2026-07-18T12:00:00.000Z'),
          startedAt: null,
          finishedAt: null,
        };
        state.jobs.push(job);
      }
      return Promise.resolve(job);
    }),
    getJob: jest.fn((id: string) =>
      Promise.resolve(state.jobs.find((item: any) => item.id === id)),
    ),
    dispatchRecordedJob: jest.fn((payload: any) => {
      let job = state.jobs.find((item: any) => item.id === payload.asyncJobId);
      if (!job) {
        job = {
          id: payload.asyncJobId,
          jobType: payload.jobType,
          status: 'QUEUED',
          parserLearningCaseId: payload.targetId,
          attempts: 0,
          maxAttempts: 3,
          result: null,
          metadata: payload.metadata,
          queuedAt: new Date('2026-07-18T12:00:00.000Z'),
          startedAt: null,
          finishedAt: null,
        };
        state.jobs.push(job);
      }
      return Promise.resolve(job);
    }),
  };
}

function officeActor() {
  return {
    id: 'auth-office',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: [
      'parser_profiles.read',
      'parser_profiles.train',
      'parser_profiles.review',
    ],
  };
}

function validFingerprintDefinition() {
  return {
    profileId: 'learning-candidate-1',
    algorithmVersion: 'workbook-fingerprint-v1',
    workbookType: 'OOXML_XLSX',
    sheet: { name: 'Sheet1' },
    anchors: [
      {
        value: '运单号',
        required: true,
        row: 6,
        column: 1,
        rowTolerance: 0,
        columnTolerance: 0,
      },
    ],
    requiredRelativeColumns: [],
    dataStart: { rowOffsetFromHeader: 1 },
  };
}
