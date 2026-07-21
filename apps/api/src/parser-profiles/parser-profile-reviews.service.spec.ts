import { ParserProfileReviewsService } from './parser-profile-reviews.service';

describe('ParserProfileReviewsService', () => {
  const actor = {
    id: 'office-1',
    email: 'office@example.com',
    name: 'Office',
    roles: ['OFFICE'],
    permissions: [
      'parser_profiles.review',
      'containers.update',
      'corrections.create',
    ],
  };
  let prisma: any;
  let worker: any;
  let policy: any;
  let service: ParserProfileReviewsService;
  let profile: any;
  let review: any;

  beforeEach(() => {
    profile = profileRecord();
    review = reviewRecord(profile);
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((callback) => callback(prisma)),
      importFile: {
        findUnique: jest.fn().mockResolvedValue({ fileSha256: 'a'.repeat(64) }),
        update: jest.fn().mockResolvedValue({}),
      },
      container: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'container-1',
          containerNo: 'TEST1234567',
          status: 'PARSED',
        }),
      },
      containerLine: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      containerDestination: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      parserProfileReview: {
        findUnique: jest.fn().mockResolvedValue(review),
        create: jest.fn().mockResolvedValue(review),
        update: jest.fn(({ data }) =>
          Promise.resolve({
            ...review,
            ...data,
            revision: review.revision + 1,
            acceptedContainer: data.acceptedContainerId
              ? {
                  id: data.acceptedContainerId,
                  containerNo: 'TEST1234567',
                  status: 'PARSED',
                }
              : null,
            reviewedBy: { id: actor.id, name: actor.name },
            reviewedAt: new Date('2026-07-20T00:00:00Z'),
          }),
        ),
      },
      parserProfileVersion: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest
          .fn()
          .mockImplementation(() => Promise.resolve(profile)),
        update: jest.fn().mockResolvedValue(profile),
      },
      parserProfileEvidence: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
      },
      parserProfileAuditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    worker = {
      matchProfiles: jest.fn(),
      executeMapping: jest.fn(),
    };
    policy = { resolve: jest.fn().mockResolvedValue(palletPolicy()) };
    service = new ParserProfileReviewsService(prisma, worker, policy);
  });

  it('stages a unique active review-required match without creating a formal container', async () => {
    prisma.parserProfileReview.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.parserProfileVersion.findMany.mockResolvedValue([
      {
        ...profile,
        id: profile.id,
        familyId: profile.familyId,
        version: 1,
        fingerprintDefinition: validFingerprint(profile.id),
        mappingDefinition: { profileVersion: 'profile-v1' },
        matcherVersion: 'workbook-fingerprint-v1',
        mappingVersion: 'parser-profile-mapping-v1',
      },
    ]);
    worker.matchProfiles.mockResolvedValue({
      workerVersion: 'parser-profile-engine-v1',
      selectedProfileId: profile.id,
      issueCode: null,
      issues: [],
      inspection: { sheets: [] },
      candidates: [
        {
          profileId: profile.id,
          algorithmVersion: 'workbook-fingerprint-v1',
          hash: 'sha256:fingerprint',
          matched: true,
          reasons: [
            { code: 'FINGERPRINT_ANCHOR_MATCHED', matched: true, params: {} },
          ],
          structuralEvidence: {},
        },
      ],
    });
    worker.executeMapping.mockResolvedValue({
      workerVersion: 'parser-profile-engine-v1',
      issues: [],
      result: canonicalWorkerResult(),
    });

    await expect(
      service.stageIfMatched(
        {
          id: 'import-1',
          storedPath: '/workspace/storage/source.xlsx',
          fileSha256: 'a'.repeat(64),
          originalFilename: 'source.xlsx',
        },
        { detection: { formatType: 'UNKNOWN' } },
        actor,
      ),
    ).resolves.toBe(true);

    expect(prisma.parserProfileReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        importFileId: 'import-1',
        sourceFileSha256: 'a'.repeat(64),
        status: 'PENDING',
        fingerprintHash: 'sha256:fingerprint',
      }),
    });
    expect(prisma.importFile.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: expect.objectContaining({ parseStatus: 'REVIEW_REQUIRED' }),
    });
    expect(prisma.container.create).not.toHaveBeenCalled();
  });

  it('atomically accepts once, locks import/review/version, and advances 1/3', async () => {
    const response = (await service.accept(
      'import-1',
      { expectedRevision: 0, reason: null },
      actor,
    )) as any;

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    expect(prisma.container.create).toHaveBeenCalledTimes(1);
    expect(prisma.parserProfileEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: 'ACCEPTED',
        accepted: true,
        materialCorrection: false,
        streakAfter: 1,
      }),
    });
    expect(prisma.parserProfileVersion.update).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: expect.objectContaining({
        trustStreak: 1,
        trustState: 'REVIEW_REQUIRED',
      }),
    });
    expect(response.acceptedContainer.id).toBe('container-1');
  });

  it('promotes only the third no-material distinct import and never writes 4/3', async () => {
    profile.trustStreak = 2;
    review.profileVersion.trustStreak = 2;
    await service.accept(
      'import-1',
      { expectedRevision: 0, reason: 'third reviewed import' },
      actor,
    );
    expect(prisma.parserProfileVersion.update).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: expect.objectContaining({
        trustStreak: 3,
        trustState: 'TRUSTED',
        lifecycleRevision: { increment: 1 },
      }),
    });
    expect(prisma.parserProfileAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventCode: 'PROFILE_TRUSTED' }),
    });

    profile.trustStreak = 3;
    profile.trustState = 'TRUSTED';
    prisma.parserProfileVersion.update.mockClear();
    await service.accept(
      'import-2',
      { expectedRevision: 0, reason: null },
      actor,
    );
    expect(prisma.parserProfileVersion.update).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: { trustStreak: 3, trustState: 'TRUSTED' },
    });
  });

  it('computes material correction on the server, commits corrected data, and resets streak', async () => {
    profile.trustStreak = 2;
    await service.correct(
      'import-1',
      {
        expectedRevision: 0,
        reason: 'Destination corrected from source workbook',
        canonicalResult: {
          containerNo: 'TEST1234567',
          lines: [
            {
              rowNumber: 3,
              included: true,
              destinationCode: 'YYC4',
              cartons: 10,
              volumeCbm: '1.200',
              packageType: 'CARTON',
              deliveryMethod: null,
              waybillNo: 'WB-1',
              referenceNo: null,
              poNumber: null,
            },
          ],
        },
      },
      actor,
    );
    expect(prisma.parserProfileEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: 'MATERIAL_CORRECTION',
        accepted: false,
        materialCorrection: true,
        streakAfter: 0,
      }),
    });
    expect(prisma.parserProfileVersion.update).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: expect.objectContaining({
        trustStreak: 0,
        trustState: 'REVIEW_REQUIRED',
      }),
    });
    expect(prisma.parserProfileReview.update).toHaveBeenCalledWith({
      where: { id: review.id },
      data: expect.objectContaining({
        finalResult: expect.anything(),
        finalDestinationSummary: expect.anything(),
        finalReportPreview: expect.anything(),
      }),
      include: expect.anything(),
    });
    expect(
      prisma.parserProfileReview.update.mock.calls[0][0].data,
    ).not.toHaveProperty('stagedResult');
  });

  it('records an outcome-neutral reference correction without resetting the streak', async () => {
    await service.correct(
      'import-1',
      {
        expectedRevision: 0,
        reason: 'Reference display value corrected without changing grouping',
        canonicalResult: {
          containerNo: 'TEST1234567',
          lines: [
            {
              rowNumber: 3,
              included: true,
              destinationCode: 'YEG1',
              cartons: 10,
              volumeCbm: '1.200',
              packageType: 'CARTON',
              deliveryMethod: null,
              waybillNo: 'DISPLAY-ONLY-REFERENCE',
              referenceNo: null,
              poNumber: null,
            },
          ],
        },
      },
      actor,
    );
    expect(prisma.parserProfileEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: 'ACCEPTED',
        accepted: true,
        materialCorrection: false,
        streakAfter: 1,
        correctionDiff: expect.anything(),
      }),
    });
    expect(prisma.parserProfileVersion.update).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: expect.objectContaining({
        trustStreak: 1,
        trustState: 'REVIEW_REQUIRED',
      }),
    });
  });

  it('does not stage after the exact version is paused or becomes trusted during worker execution', async () => {
    prisma.parserProfileReview.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.parserProfileVersion.findMany.mockResolvedValue([
      {
        ...profile,
        id: profile.id,
        familyId: profile.familyId,
        version: 1,
        fingerprintDefinition: validFingerprint(profile.id),
        mappingDefinition: { profileVersion: 'profile-v1' },
        matcherVersion: 'workbook-fingerprint-v1',
        mappingVersion: 'parser-profile-mapping-v1',
      },
    ]);
    worker.matchProfiles.mockResolvedValue(matchedPayload(profile.id));
    worker.executeMapping.mockResolvedValue({
      workerVersion: 'parser-profile-engine-v1',
      issues: [],
      result: canonicalWorkerResult(),
    });
    prisma.parserProfileVersion.findUnique.mockResolvedValue({
      ...profile,
      lifecycle: 'PAUSED',
      trustState: 'TRUSTED',
      matcherVersion: 'workbook-fingerprint-v1',
      mappingVersion: 'parser-profile-mapping-v1',
    });

    await expect(
      service.stageIfMatched(stageImport(), { detection: {} }, actor),
    ).resolves.toBe(true);
    expect(prisma.parserProfileReview.create).not.toHaveBeenCalled();
    expect(prisma.parserProfileAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventCode: 'REVIEW_MATCH_FAILED',
        metadata: expect.objectContaining({
          code: 'PARSER_REVIEW_PROFILE_STATE_CHANGED',
        }),
      }),
    });
    expect(prisma.importFile.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: expect.objectContaining({ parseStatus: 'REVIEW_REQUIRED' }),
    });
  });

  it('auto-commits only a unique trusted match and records pinned selection evidence', async () => {
    profile.trustState = 'TRUSTED';
    profile.trustStreak = 3;
    prisma.parserProfileReview.findUnique.mockResolvedValueOnce(null);
    prisma.parserProfileVersion.findMany.mockResolvedValue([
      {
        ...profile,
        fingerprintDefinition: validFingerprint(profile.id),
        mappingDefinition: { profileVersion: 'profile-v1' },
      },
    ]);
    worker.matchProfiles.mockResolvedValue(matchedPayload(profile.id));
    worker.executeMapping.mockResolvedValue({
      workerVersion: 'parser-profile-engine-v1',
      issues: [],
      result: canonicalWorkerResult(),
    });

    await expect(
      service.stageIfMatched(
        stageImport(),
        { detection: { format_type: 'UNLOADING_PLAN_CN', confidence: 0.8 } },
        actor,
      ),
    ).resolves.toBe(true);

    expect(prisma.container.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parserSourceKind: 'PROFILE',
        parserProfileVersionId: profile.id,
      }),
    });
    expect(prisma.importFile.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: expect.objectContaining({
        parseStatus: 'PARSED',
        rawMetadata: expect.objectContaining({
          parseSelection: expect.objectContaining({
            source: 'TRUSTED_PROFILE',
            reasonCode: 'PARSER_PROFILE_UNIQUE_TRUSTED_MATCH',
            autoCommitted: true,
          }),
        }),
      }),
    });
    expect(prisma.parserProfileAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventCode: 'TRUSTED_AUTO_COMMITTED' }),
    });
    expect(prisma.parserProfileReview.create).not.toHaveBeenCalled();
  });

  it('rechecks queued trust state under lock and stages instead of committing stale trust', async () => {
    profile.trustState = 'TRUSTED';
    profile.trustStreak = 3;
    prisma.parserProfileReview.findUnique.mockResolvedValueOnce(null);
    prisma.parserProfileVersion.findMany.mockResolvedValue([
      {
        ...profile,
        fingerprintDefinition: validFingerprint(profile.id),
        mappingDefinition: { profileVersion: 'profile-v1' },
      },
    ]);
    prisma.parserProfileVersion.findUnique.mockResolvedValue({
      ...profile,
      trustState: 'REVIEW_REQUIRED',
      trustStreak: 0,
      lifecycleRevision: profile.lifecycleRevision + 1,
    });
    worker.matchProfiles.mockResolvedValue(matchedPayload(profile.id));
    worker.executeMapping.mockResolvedValue({
      workerVersion: 'parser-profile-engine-v1',
      issues: [],
      result: canonicalWorkerResult(),
    });

    await expect(
      service.stageIfMatched(stageImport(), { detection: {} }, actor),
    ).resolves.toBe(true);

    expect(prisma.container.create).not.toHaveBeenCalled();
    expect(prisma.parserProfileReview.create).toHaveBeenCalledTimes(1);
    expect(prisma.parserProfileAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventCode: 'TRUSTED_AUTO_FALLBACK' }),
    });
    expect(prisma.importFile.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: expect.objectContaining({
        parseStatus: 'REVIEW_REQUIRED',
        errorMessage: 'PARSER_PROFILE_STATE_CHANGED_BEFORE_COMMIT',
      }),
    });
  });

  it('stages trusted output with required-field warnings instead of auto-committing', async () => {
    profile.trustState = 'TRUSTED';
    profile.trustStreak = 3;
    prisma.parserProfileReview.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.parserProfileVersion.findMany.mockResolvedValue([
      {
        ...profile,
        fingerprintDefinition: validFingerprint(profile.id),
        mappingDefinition: { profileVersion: 'profile-v1' },
      },
    ]);
    worker.matchProfiles.mockResolvedValue(matchedPayload(profile.id));
    worker.executeMapping.mockResolvedValue({
      workerVersion: 'parser-profile-engine-v1',
      issues: [],
      result: {
        ...canonicalWorkerResult(),
        warnings: [{ code: 'MISSING_VOLUME' }],
      },
    });

    await expect(
      service.stageIfMatched(stageImport(), { detection: {} }, actor),
    ).resolves.toBe(true);

    expect(prisma.container.create).not.toHaveBeenCalled();
    expect(prisma.parserProfileReview.create).toHaveBeenCalledTimes(1);
    expect(prisma.importFile.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: expect.objectContaining({
        parseStatus: 'REVIEW_REQUIRED',
        rawMetadata: expect.objectContaining({
          parseSelection: expect.objectContaining({
            reasonCode: 'PARSER_PROFILE_REQUIRED_WARNING_REVIEW',
            blockingWarningCodes: ['MISSING_VOLUME'],
          }),
        }),
      }),
    });
  });

  it('never chooses a winner for collision or drift and holds the import for review', async () => {
    prisma.parserProfileReview.findUnique.mockResolvedValueOnce(null);
    prisma.parserProfileVersion.findMany.mockResolvedValue([
      {
        ...profile,
        fingerprintDefinition: validFingerprint(profile.id),
        mappingDefinition: { profileVersion: 'profile-v1' },
      },
    ]);
    worker.matchProfiles.mockResolvedValue({
      workerVersion: 'parser-profile-engine-v1',
      selectedProfileId: null,
      issueCode: 'FINGERPRINT_STRUCTURAL_DRIFT',
      issues: [],
      inspection: { sheets: [] },
      candidates: [
        {
          ...matchedPayload(profile.id).candidates[0],
          matched: false,
          reasons: [
            {
              code: 'FINGERPRINT_REQUIRED_ANCHOR_MISSING',
              matched: false,
              params: {},
            },
          ],
        },
      ],
    });

    await expect(
      service.stageIfMatched(stageImport(), { detection: {} }, actor),
    ).resolves.toBe(true);
    expect(worker.executeMapping).not.toHaveBeenCalled();
    expect(prisma.container.create).not.toHaveBeenCalled();
    expect(prisma.importFile.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: expect.objectContaining({
        parseStatus: 'REVIEW_REQUIRED',
        rawMetadata: expect.objectContaining({
          parseSelection: expect.objectContaining({ source: 'DRIFT' }),
        }),
      }),
    });
  });

  it('bounds the active profile candidate query and leaves no-match on built-in path', async () => {
    prisma.parserProfileReview.findUnique.mockResolvedValueOnce(null);
    prisma.parserProfileVersion.findMany.mockResolvedValue([]);

    await expect(
      service.stageIfMatched(stageImport(), { detection: {} }, actor),
    ).resolves.toBe(false);
    expect(prisma.parserProfileVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(prisma.container.create).not.toHaveBeenCalled();
    expect(prisma.importFile.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: expect.objectContaining({
        rawMetadata: expect.objectContaining({
          parseSelection: expect.objectContaining({ source: 'BUILT_IN' }),
        }),
      }),
    });
  });

  it('persists profile execution failure and blocks a silent built-in commit', async () => {
    prisma.parserProfileReview.findUnique.mockResolvedValueOnce(null);
    prisma.parserProfileVersion.findMany.mockResolvedValue([
      {
        ...profile,
        id: profile.id,
        familyId: profile.familyId,
        version: 1,
        fingerprintDefinition: validFingerprint(profile.id),
        mappingDefinition: { profileVersion: 'profile-v1' },
        matcherVersion: 'workbook-fingerprint-v1',
        mappingVersion: 'parser-profile-mapping-v1',
      },
    ]);
    worker.matchProfiles.mockResolvedValue(matchedPayload(profile.id));
    worker.executeMapping.mockResolvedValue({
      workerVersion: 'parser-profile-engine-v1',
      result: null,
      issues: [{ code: 'MAPPING_SOURCE_COLUMN_NOT_FOUND' }],
    });

    await expect(
      service.stageIfMatched(stageImport(), { detection: {} }, actor),
    ).resolves.toBe(true);
    expect(prisma.importFile.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: expect.objectContaining({
        parseStatus: 'ERROR',
        errorMessage: 'MAPPING_SOURCE_COLUMN_NOT_FOUND',
      }),
    });
    expect(prisma.parserProfileAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventCode: 'REVIEW_EXECUTION_FAILED' }),
    });
  });

  it('keeps staged parser errors immutable and refuses false-success acceptance', async () => {
    review.errors = [{ code: 'MAPPING_TRANSFORM_FAILED' }];
    await expect(
      service.accept('import-1', { expectedRevision: 0, reason: null }, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PARSER_REVIEW_ERRORS_MUST_BE_RESOLVED',
      }),
    });
    expect(prisma.container.create).not.toHaveBeenCalled();
    expect(review.errors).toEqual([{ code: 'MAPPING_TRANSFORM_FAILED' }]);
  });

  it('returns an already accepted review idempotently without duplicate business writes', async () => {
    review.status = 'ACCEPTED';
    review.acceptedContainer = {
      id: 'container-existing',
      containerNo: 'TEST1234567',
      status: 'PARSED',
    };
    await service.accept(
      'import-1',
      { expectedRevision: 0, reason: null },
      actor,
    );
    expect(prisma.container.create).not.toHaveBeenCalled();
    expect(prisma.parserProfileEvidence.create).not.toHaveBeenCalled();
  });

  it('rejects explicitly, preserves evidence, and resets the consecutive streak', async () => {
    profile.trustStreak = 2;
    await service.reject(
      'import-1',
      { expectedRevision: 0, reason: 'Wrong customer layout' },
      actor,
    );
    expect(prisma.parserProfileEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outcome: 'REJECTED',
        streakAfter: 0,
        reason: 'Wrong customer layout',
      }),
    });
    expect(prisma.container.create).not.toHaveBeenCalled();
    expect(prisma.importFile.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: expect.objectContaining({
        parseStatus: 'ERROR',
        errorMessage: 'PARSER_PROFILE_MATCH_REJECTED',
      }),
    });
  });
});

function profileRecord() {
  return {
    id: 'profile-v1',
    familyId: 'family-1',
    version: 1,
    lifecycle: 'ACTIVE',
    trustState: 'REVIEW_REQUIRED',
    trustStreak: 0,
    lifecycleRevision: 0,
    matcherVersion: 'workbook-fingerprint-v1',
    mappingVersion: 'parser-profile-mapping-v1',
    family: {
      id: 'family-1',
      stableName: 'real-layout',
      customerLabel: 'Real layout',
    },
  };
}

function reviewRecord(profile: any) {
  return {
    id: 'review-1',
    importFileId: 'import-1',
    profileVersionId: profile.id,
    sourceFileSha256: 'a'.repeat(64),
    status: 'PENDING',
    revision: 0,
    fingerprintHash: 'sha256:fingerprint',
    matcherVersion: 'workbook-fingerprint-v1',
    mappingVersion: 'parser-profile-mapping-v1',
    workerVersion: 'parser-profile-engine-v1',
    parserVersion: 'parser-profile-engine-v1',
    builtInEvidence: {},
    matchEvidence: { reasons: [] },
    sourcePreview: { sheets: [] },
    stagedResult: {
      ...canonicalWorkerResult(),
      palletPolicy: palletPolicy(),
    },
    finalResult: null,
    destinationSummary: [],
    finalDestinationSummary: null,
    reportPreview: {},
    finalReportPreview: null,
    warnings: [],
    errors: [],
    provenance: {},
    correctionDiff: null,
    decisionReason: null,
    acceptedContainerId: null,
    acceptedContainer: null,
    reviewedById: null,
    reviewedBy: null,
    reviewedAt: null,
    profileVersion: profile,
    createdAt: new Date('2026-07-20T00:00:00Z'),
    updatedAt: new Date('2026-07-20T00:00:00Z'),
  };
}

function stageImport() {
  return {
    id: 'import-1',
    storedPath: '/workspace/storage/source.xlsx',
    fileSha256: 'a'.repeat(64),
    originalFilename: 'source.xlsx',
  };
}

function matchedPayload(profileId: string) {
  return {
    workerVersion: 'parser-profile-engine-v1',
    selectedProfileId: profileId,
    issueCode: null,
    issues: [],
    inspection: { sheets: [] },
    candidates: [
      {
        profileId,
        algorithmVersion: 'workbook-fingerprint-v1',
        hash: 'sha256:fingerprint',
        matched: true,
        reasons: [],
        structuralEvidence: {},
      },
    ],
  };
}

function canonicalWorkerResult() {
  return {
    containerNo: 'TEST1234567',
    company: 'Bestar',
    formatType: 'UNLOADING_PLAN_CN',
    parserVersion: 'parser-profile-engine-v1',
    lines: [
      {
        rowNumber: 3,
        destinationCode: 'YEG1',
        cartons: 10,
        volumeCbm: 1.2,
        packageType: 'CARTON',
        deliveryMethod: null,
        waybillNo: 'WB-1',
        raw_json: { source: 'real fixture derived' },
        warnings: [],
        errors: [],
      },
    ],
    destinationSummaries: [],
    warnings: [],
    errors: [],
    rawMetadata: {},
    provenance: {},
  };
}

function palletPolicy() {
  return {
    policyVersion: 'pallet-footprint-v1',
    settingsRevision: 'settings-1',
    palletLengthM: '1.0',
    palletWidthM: '1.2',
    lowHeightM: '1.7',
    otherHeightM: '2.2',
    lowHeightCapacityCbm: '2.04',
    otherDestinationCapacityCbm: '2.64',
    yeg1ExtraPallets: 4,
    lowHeightDestinationCodes: ['YEG1', 'YYC4'],
    otherDestinationAliases: ['YVR2'],
    destinationAliasVersion: 'aliases-v1',
  };
}

function validFingerprint(profileId: string) {
  return {
    profileId,
    algorithmVersion: 'workbook-fingerprint-v1',
    workbookType: 'OOXML_XLSX',
    sheet: { name: 'Sheet1' },
    anchors: [{ value: 'Warehouse', row: 2, column: 1 }],
  };
}
