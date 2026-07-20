import { ConfigService } from '@nestjs/config';
import { ParserProfilesService } from './parser-profiles.service';

describe('ParserProfilesService', () => {
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin',
    roles: ['ADMIN'],
    permissions: ['parser_profiles.approve'],
  };
  let prisma: any;
  let service: ParserProfilesService;
  let record: any;
  let eligibilitySpy: jest.SpyInstance;

  beforeEach(() => {
    record = profileRecord();
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((callback) => callback(prisma)),
      parserProfileVersion: {
        findUnique: jest.fn(() => Promise.resolve(record)),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ version: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(record),
        create: jest.fn(({ data }) =>
          Promise.resolve({ ...record, ...data, id: 'profile-v2' }),
        ),
      },
      parserProfileFamily: { findUnique: jest.fn() },
      parserProfileAuditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    service = new ParserProfilesService(prisma, {
      getOrThrow: jest.fn().mockReturnValue('/workspace/storage'),
    } as unknown as ConfigService);
    eligibilitySpy = jest
      .spyOn(service as any, 'approvalEligibilityCodes')
      .mockResolvedValue([]);
  });

  it('approves only the expected replay and initializes ACTIVE + REVIEW_REQUIRED + 0/3', async () => {
    await service.approve(
      record.id,
      { expectedRevision: 0, replayId: 'replay-1', reason: 'Reviewed evidence' },
      admin,
    );

    expect(prisma.parserProfileVersion.updateMany).toHaveBeenCalledWith({
      where: {
        id: record.id,
        lifecycle: 'DRAFT',
        lifecycleRevision: 0,
      },
      data: expect.objectContaining({
        lifecycle: 'ACTIVE',
        trustState: 'REVIEW_REQUIRED',
        trustStreak: 0,
        approvedById: 'admin-1',
        approvalReason: 'Reviewed evidence',
      }),
    });
    expect(prisma.parserProfileAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventCode: 'PROFILE_APPROVED',
        actorId: 'admin-1',
        metadata: expect.objectContaining({
          replayId: 'replay-1',
          trustStreak: 0,
        }),
      }),
    });
  });

  it('rejects a stale lifecycle revision before mutation', async () => {
    record.lifecycleRevision = 2;
    await expect(
      service.approve(
        record.id,
        { expectedRevision: 1, replayId: 'replay-1', reason: 'Old screen' },
        admin,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROFILE_LIFECYCLE_REVISION_CONFLICT',
      }),
    });
    expect(prisma.parserProfileVersion.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an active matcher-scope conflict explicitly', async () => {
    prisma.parserProfileVersion.findMany.mockResolvedValue([
      { id: 'active-conflict', fingerprintDefinition: { anchors: ['A1'] } },
    ]);
    record.fingerprintDefinition = { anchors: ['A1'] };

    await expect(
      service.approve(
        record.id,
        { expectedRevision: 0, replayId: 'replay-1', reason: 'Conflict' },
        admin,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROFILE_APPROVAL_NOT_ELIGIBLE',
        details: expect.objectContaining({
          eligibilityCodes: ['PROFILE_APPROVAL_ACTIVE_MATCHER_CONFLICT'],
        }),
      }),
    });
    expect(prisma.parserProfileVersion.findMany).toHaveBeenCalledWith({
      where: {
        familyId: 'family-1',
        lifecycle: 'ACTIVE',
        id: { not: record.id },
      },
      select: { id: true, fingerprintDefinition: true },
    });
  });

  it('returns stable eligibility codes for missing provenance, failed diff, and stale replay contracts', async () => {
    eligibilitySpy.mockRestore();
    jest.spyOn(service as any, 'sourceReadable').mockResolvedValue(true);
    jest.spyOn(service as any, 'hash').mockReturnValue('snapshot-hash');
    record.mappingDefinition.fields.cartons = {};
    record.sourceLearningCase.replaySummary = {
      artifactId: 'replay-1',
      draftRevision: 0,
      passed: false,
      blockingCodes: ['PROFILE_REPLAY_CARTONS_MISMATCH'],
      pinned: {
        sourceFileSha256: 'wrong-sha',
        manualSnapshotHash: 'wrong-snapshot',
      },
    };

    await expect(service.getVersion(record.id)).resolves.toMatchObject({
      approvalEligibility: {
        eligible: false,
        codes: expect.arrayContaining([
          'PROFILE_APPROVAL_PROVENANCE_REQUIRED',
          'PROFILE_APPROVAL_REPLAY_NOT_PASSED',
          'PROFILE_APPROVAL_REPLAY_CONTRACT_STALE',
          'PROFILE_APPROVAL_REPLAY_SNAPSHOT_STALE',
        ]),
      },
    });
  });

  it('keeps a draft unchanged when approval eligibility is incomplete', async () => {
    eligibilitySpy.mockResolvedValue([
      'PROFILE_APPROVAL_PROVENANCE_REQUIRED',
      'PROFILE_APPROVAL_REPLAY_NOT_PASSED',
    ]);

    await expect(
      service.approve(
        record.id,
        { expectedRevision: 0, replayId: 'replay-1', reason: 'Not ready' },
        admin,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROFILE_APPROVAL_NOT_ELIGIBLE',
        details: expect.objectContaining({
          eligibilityCodes: [
            'PROFILE_APPROVAL_PROVENANCE_REQUIRED',
            'PROFILE_APPROVAL_REPLAY_NOT_PASSED',
          ],
        }),
      }),
    });
    expect(prisma.parserProfileVersion.updateMany).not.toHaveBeenCalled();
  });

  it('pause, resume and retire change lifecycle without changing trust or streak', async () => {
    record.lifecycle = 'ACTIVE';
    record.trustState = 'TRUSTED';
    record.trustStreak = 3;
    await service.pause(
      record.id,
      { expectedRevision: 0, reason: 'Investigate drift' },
      admin,
    );
    expect(prisma.parserProfileVersion.update).toHaveBeenCalledWith({
      where: { id: record.id },
      data: expect.not.objectContaining({ trustState: expect.anything() }),
    });

    record.lifecycle = 'PAUSED';
    prisma.parserProfileVersion.findMany.mockResolvedValue([]);
    await service.resume(
      record.id,
      { expectedRevision: 0, reason: 'Evidence reviewed' },
      admin,
    );
    expect(prisma.parserProfileVersion.update).toHaveBeenCalledWith({
      where: { id: record.id },
      data: expect.objectContaining({ lifecycle: 'ACTIVE' }),
    });

    record.lifecycle = 'PAUSED';
    await service.retire(
      record.id,
      { expectedRevision: 0, reason: 'Customer layout replaced' },
      admin,
    );
    expect(prisma.parserProfileVersion.update).toHaveBeenCalledWith({
      where: { id: record.id },
      data: expect.objectContaining({ lifecycle: 'RETIRED' }),
    });
  });

  it('forks an active mapping into a new DRAFT with no inherited streak', async () => {
    record.lifecycle = 'ACTIVE';
    record.trustState = 'TRUSTED';
    record.trustStreak = 3;
    await service.fork(
      record.id,
      { expectedRevision: 0, reason: 'New optional column' },
      admin,
    );
    expect(prisma.parserProfileVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lifecycle: 'DRAFT',
        trustState: 'REVIEW_REQUIRED',
        trustStreak: 0,
      }),
    });
  });
});

function profileRecord() {
  const completionSnapshot = {
    containerNo: 'MANU1234567',
    detailRows: [],
    destinations: [],
    referenceEvidence: [],
  };
  return {
    id: 'profile-v1',
    familyId: 'family-1',
    sourceLearningCaseId: 'case-1',
    sourceDraftRevision: 1,
    version: 1,
    lifecycle: 'DRAFT',
    trustState: 'REVIEW_REQUIRED',
    trustStreak: 0,
    lifecycleRevision: 0,
    mappingDefinition: {
      container: { sources: [{ kind: 'cell', cell: 'A1' }] },
      fields: {
        destinationCode: { sources: [{ kind: 'column', header: 'Dest' }] },
        cartons: { sources: [{ kind: 'column', header: 'Cartons' }] },
        volumeCbm: { sources: [{ kind: 'column', header: 'Volume' }] },
      },
    },
    fingerprintDefinition: { anchors: ['A1'] },
    matcherVersion: 'fingerprint-v1',
    mappingVersion: 'mapping-v1',
    approvedById: null,
    approvedBy: null,
    auditEvents: [
      {
        actor: { id: 'office-1', name: 'Office', email: 'office@example.com' },
        occurredAt: new Date('2026-07-19T00:00:00.000Z'),
      },
    ],
    approvedAt: null,
    approvalReason: null,
    lifecycleReason: null,
    createdById: 'office-1',
    createdBy: { id: 'office-1', name: 'Office', email: 'office@example.com' },
    family: {
      id: 'family-1',
      stableName: 'customer-layout',
      customerLabel: 'Customer layout',
    },
    sourceLearningCase: {
      id: 'case-1',
      sourceImportId: 'import-1',
      sourceImportReferenceId: 'import-1',
      sourceFileSha256: 'a'.repeat(64),
      linkedContainerId: 'container-1',
      draftRevision: 1,
      completionSnapshot,
      replaySummary: {
        artifactId: 'replay-1',
        draftRevision: 1,
        passed: true,
        blockingCodes: [],
        pinned: {},
      },
      sourceImport: {
        id: 'import-1',
        storedPath: 'imports/source.xlsx',
        fileSha256: 'a'.repeat(64),
        originalFilename: 'source.xlsx',
        deletedAt: null,
      },
      linkedContainer: {
        id: 'container-1',
        containerNo: 'MANU1234567',
        status: 'UNLOADED',
      },
      completionReplayJob: null,
    },
    createdAt: new Date('2026-07-19T00:00:00.000Z'),
    updatedAt: new Date('2026-07-19T00:00:00.000Z'),
  };
}
