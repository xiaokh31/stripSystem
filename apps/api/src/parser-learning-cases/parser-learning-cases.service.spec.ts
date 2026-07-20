import { ParserLearningCasesService } from './parser-learning-cases.service';

describe('ParserLearningCasesService', () => {
  const officeActor = {
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
  let prisma: any;
  let worker: any;
  let asyncJobs: any;
  let service: ParserLearningCasesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    worker = {
      validateDefinition: jest.fn().mockResolvedValue({
        valid: true,
        mappingSchemaVersion: 'parser-profile-mapping-v1',
        fingerprintVersion: 'workbook-fingerprint-v1',
        workerVersion: 'parser-profile-engine-v1',
        issues: [],
      }),
      inspectFile: jest.fn(),
      executeMapping: jest.fn(),
    };
    asyncJobs = {
      submitJob: jest.fn(),
      getJob: jest.fn(),
      getQueueName: jest.fn().mockReturnValue('bestar-async-jobs'),
      dispatchRecordedJob: jest.fn().mockResolvedValue({ id: 'completion-job' }),
    };
    service = new ParserLearningCasesService(prisma, worker, asyncJobs, {
      getOrThrow: jest.fn().mockReturnValue('/workspace/samples'),
    } as never);
  });

  it('idempotently returns the active case for the same failed import', async () => {
    const existing = caseRecord();
    prisma.parserLearningCase.findUnique.mockResolvedValue(existing);

    await expect(service.start('import-error', officeActor)).resolves.toEqual(
      expect.objectContaining({
        id: 'case-1',
        sourceImportId: 'import-error',
        status: 'OPEN',
      }),
    );
    expect(prisma.parserLearningCase.create).not.toHaveBeenCalled();
    expect(prisma.parserProfileAuditEvent.create).not.toHaveBeenCalled();
  });

  it('creates one auditable case for an unsupported import', async () => {
    prisma.parserLearningCase.findUnique.mockResolvedValueOnce(null);

    const result = await service.start('import-error', officeActor);

    expect(result).toMatchObject({
      id: 'case-1',
      sourceImportId: 'import-error',
      sourceFileSha256: 'sha-error',
    });
    expect(prisma.parserLearningCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceImportId: 'import-error',
          sourceImportReferenceId: 'import-error',
          sourceFileSha256: 'sha-error',
          createdById: 'auth-office',
        }),
      }),
    );
    expect(prisma.parserProfileAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventCode: 'CASE_CREATED',
        actorId: 'auth-office',
        importFileId: 'import-error',
      }),
    });
  });

  it('rejects successfully parsed imports with a stable code', async () => {
    prisma.importFile.findUnique.mockResolvedValue({
      id: 'import-parsed',
      fileSha256: 'sha-parsed',
      format: 'UNLOADING_PLAN_CN',
      parseStatus: 'PARSED',
    });

    await expect(
      service.start('import-parsed', officeActor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PARSER_LEARNING_IMPORT_STATUS_NOT_ALLOWED',
      }),
    });
    expect(prisma.parserLearningCase.create).not.toHaveBeenCalled();
  });

  it('links one manual container and audits the actor in one transaction', async () => {
    const result = await service.linkContainer(
      'case-1',
      'container-manual',
      officeActor,
    );

    expect(result).toMatchObject({
      id: 'case-1',
      status: 'OPEN',
      linkedContainer: { id: 'container-manual' },
    });
    expect(prisma.parserLearningCase.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'case-1', linkedContainerId: null }),
      data: expect.objectContaining({
        linkedContainerId: 'container-manual',
        status: 'OPEN',
        updatedById: 'auth-office',
      }),
    });
    expect(prisma.parserProfileAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventCode: 'CONTAINER_LINKED',
        actorId: 'auth-office',
        containerId: 'container-manual',
      }),
    });
  });

  it('rejects a second container for a linked case', async () => {
    prisma.parserLearningCase.findUnique.mockResolvedValue(
      caseRecord({
        status: 'OPEN',
        linkedContainerId: 'container-first',
        linkedContainer: manualContainer('container-first'),
      }),
    );

    await expect(
      service.linkContainer('case-1', 'container-second', officeActor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PARSER_LEARNING_CASE_ALREADY_LINKED',
      }),
    });
    expect(prisma.parserLearningCase.updateMany).not.toHaveBeenCalled();
  });

  it('unlinks and closes without deleting either source record', async () => {
    prisma.parserLearningCase.findUnique
      .mockResolvedValueOnce(
        caseRecord({
          status: 'OPEN',
          linkedContainerId: 'container-manual',
          linkedContainer: manualContainer('container-manual'),
        }),
      )
      .mockResolvedValueOnce(caseRecord())
      .mockResolvedValueOnce(caseRecord())
      .mockResolvedValueOnce(
        caseRecord({
          status: 'CLOSED',
          sourceImportId: null,
          sourceImport: null,
          closedById: 'auth-office',
          closedAt: new Date('2026-07-18T00:10:00.000Z'),
        }),
      );

    await expect(
      service.unlinkContainer('case-1', officeActor),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'OPEN', linkedContainer: null }),
    );
    await expect(
      service.close('case-1', 'OBSOLETE_DRAFT', officeActor),
    ).resolves.toEqual(expect.objectContaining({ status: 'CLOSED' }));

    expect(prisma.parserLearningCase.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'case-1' },
      data: expect.objectContaining({
        linkedContainerId: null,
        status: 'OPEN',
      }),
    });
    expect(prisma.parserLearningCase.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'case-1' },
      data: expect.objectContaining({
        sourceImportId: null,
        linkedContainerId: null,
        status: 'CLOSED',
        closedById: 'auth-office',
      }),
    });
    expect(prisma.container.delete).not.toHaveBeenCalled();
    expect(prisma.importFile.delete).not.toHaveBeenCalled();
  });

  it('audits and blocks import deletion when learning or evidence exists', async () => {
    prisma.parserLearningCase.findUnique.mockResolvedValue({ id: 'case-1' });
    prisma.parserProfileEvidence.findFirst.mockResolvedValue({
      id: 'evidence-1',
      profileVersionId: 'profile-version-1',
    });

    await expect(
      service.assertImportDeletionAllowed('import-error', officeActor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'IMPORT_USED_BY_PARSER_LEARNING',
      }),
    });
    expect(prisma.parserProfileAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventCode: 'IMPORT_DELETE_BLOCKED',
        actorId: 'auth-office',
        importFileId: 'import-error',
      }),
    });
  });

  it('returns a blocker after auditing when the caller must commit before throwing', async () => {
    prisma.parserLearningCase.findUnique.mockResolvedValue({ id: 'case-1' });

    await expect(
      service.assertImportDeletionAllowed(
        'import-error',
        officeActor,
        prisma,
        false,
      ),
    ).resolves.toMatchObject({ code: 'IMPORT_USED_BY_PARSER_LEARNING' });
    expect(prisma.parserProfileAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventCode: 'IMPORT_DELETE_BLOCKED',
        importFileId: 'import-error',
      }),
    });
  });

  it('does not close a case used by approved profile history', async () => {
    prisma.parserProfileVersion.findFirst.mockResolvedValue({
      id: 'profile-version-active',
      lifecycle: 'ACTIVE',
    });

    await expect(
      service.close('case-1', 'OBSOLETE_DRAFT', officeActor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PARSER_LEARNING_CASE_HAS_PROFILE_DEPENDENCY',
      }),
    });
    expect(prisma.parserLearningCase.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid mapping contract before mutating the case', async () => {
    worker.validateDefinition.mockResolvedValue({
      valid: false,
      mappingSchemaVersion: 'parser-profile-mapping-v1',
      fingerprintVersion: 'workbook-fingerprint-v1',
      workerVersion: 'parser-profile-engine-v1',
      issues: [{ code: 'MAPPING_OPERATION_UNKNOWN' }],
    });

    await expect(
      service.saveDraft(
        'case-1',
        {
          expectedRevision: 0,
          mappingDefinition: completeMappingDefinition(),
          fingerprintDefinition: {},
        },
        officeActor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROFILE_MAPPING_DEFINITION_INVALID',
      }),
    });
    expect(prisma.parserLearningCase.updateMany).not.toHaveBeenCalled();
  });

  it('saves a complete guarded revision and makes a linked case replay-ready', async () => {
    prisma.parserLearningCase.findUnique.mockResolvedValue(
      caseRecord({
        linkedContainerId: 'container-manual',
        linkedContainer: manualContainer('container-manual'),
      }),
    );

    await expect(
      service.saveDraft(
        'case-1',
        {
          expectedRevision: 0,
          mappingDefinition: completeMappingDefinition(),
          fingerprintDefinition: {},
        },
        officeActor,
      ),
    ).resolves.toBeDefined();
    expect(prisma.parserLearningCase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ draftRevision: 0 }),
        data: expect.objectContaining({
          draftRevision: 1,
          status: 'READY_FOR_REPLAY',
        }),
      }),
    );
  });

  it('rejects stale draft revisions without invoking the worker', async () => {
    prisma.parserLearningCase.findUnique.mockResolvedValue(
      caseRecord({ draftRevision: 2, draftDefinition: draftEnvelope() }),
    );

    await expect(
      service.preview('case-1', { revision: 1 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROFILE_DRAFT_REVISION_CONFLICT',
      }),
    });
    expect(worker.executeMapping).not.toHaveBeenCalled();
  });

  it('previews at most 50 canonical rows without business persistence', async () => {
    prisma.parserLearningCase.findUnique.mockResolvedValue(
      caseRecord({ draftRevision: 1, draftDefinition: draftEnvelope() }),
    );
    worker.executeMapping.mockResolvedValue({
      workerVersion: 'parser-profile-engine-v1',
      issues: [],
      result: {
        containerNo: 'CAAU8011090',
        formatType: 'UNLOADING_PLAN_CN',
        confidence: 1,
        parserVersion: 'parser-profile-engine-v1',
        lines: Array.from({ length: 55 }, (_, index) => ({
          rowNumber: index + 7,
        })),
        destinationSummaries: [],
        warnings: [],
        errors: [],
        provenance: {},
        rawMetadata: { inputSha256: 'sha-error' },
      },
    });

    await expect(
      service.preview('case-1', { revision: 1 }),
    ).resolves.toMatchObject({
      totalRows: 55,
      sampleRows: expect.arrayContaining([{ rowNumber: 7 }]),
    });
    const result = (await service.preview('case-1', { revision: 1 })) as {
      sampleRows: unknown[];
    };
    expect(result.sampleRows).toHaveLength(50);
    expect(prisma.container.update).toBeUndefined();
    expect(prisma.parserLearningCase.updateMany).not.toHaveBeenCalled();
  });

  it('pins queue idempotency to case and revision', async () => {
    prisma.parserLearningCase.findUnique.mockResolvedValue(
      caseRecord({
        draftRevision: 1,
        draftDefinition: draftEnvelope(),
        linkedContainerId: 'container-manual',
        linkedContainer: manualContainer('container-manual'),
      }),
    );
    asyncJobs.submitJob.mockResolvedValue({
      id: 'job-1',
      jobType: 'PARSER_PROFILE_REPLAY',
      status: 'QUEUED',
      parserLearningCaseId: 'case-1',
      attempts: 0,
      maxAttempts: 3,
      result: null,
      queuedAt: new Date('2026-07-18T01:00:00.000Z'),
      startedAt: null,
      finishedAt: null,
    });

    await service.queueReplay(
      'case-1',
      { revision: 1, idempotencyKey: 'request-0001' },
      officeActor,
    );
    expect(asyncJobs.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        parserLearningCaseId: 'case-1',
        idempotencyScope: '1:request-0001',
        maxAttempts: 3,
        reuseTerminal: true,
      }),
    );
  });

  it('guards queue-failure state updates with the observed case revision time', async () => {
    const updatedAt = new Date('2026-07-18T00:00:00.000Z');
    prisma.parserLearningCase.findUnique.mockResolvedValue(
      caseRecord({
        draftRevision: 1,
        draftDefinition: draftEnvelope(),
        linkedContainerId: 'container-manual',
        linkedContainer: manualContainer('container-manual'),
        updatedAt,
      }),
    );
    asyncJobs.submitJob.mockRejectedValue(new Error('queue unavailable'));

    await expect(
      service.queueReplay(
        'case-1',
        { revision: 1, idempotencyKey: 'request-failure-0001' },
        officeActor,
      ),
    ).rejects.toThrow('queue unavailable');

    expect(prisma.parserLearningCase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'case-1',
          draftRevision: 1,
          activeReplayToken: null,
          updatedAt,
        }),
      }),
    );
  });

  it('maps a missing generic async job to the replay-specific stable code', async () => {
    asyncJobs.getJob.mockRejectedValue({
      getResponse: () => ({ code: 'ASYNC_JOB_NOT_FOUND' }),
    });

    await expect(
      service.getReplayJob('case-1', 'job-missing'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROFILE_REPLAY_JOB_NOT_FOUND',
      }),
    });
  });

  it('compares parser reference evidence without mixing row identity into field evidence', () => {
    const diff = (service as any).buildReplayDiff(
      {
        result: {
          containerNo: 'MANU1234567',
          lines: [
            {
              rowNumber: 7,
              waybillNo: 'WB-1',
              fbaNo: 'FBA-1',
              poNumber: 'PO-1',
              itemNo: 'ITEM-1',
            },
          ],
          destinationSummaries: [],
        },
      },
      {
        containerNo: 'MANU1234567',
        detailRows: [{ lineNo: 7 }],
        destinations: [],
        referenceEvidence: [
          {
            waybillNo: 'WB-1',
            fbaNo: 'FBA-1',
            poNumber: 'PO-1',
            itemNo: 'ITEM-1',
          },
        ],
      },
    );

    expect(diff.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'referenceEvidence',
          code: 'PROFILE_REPLAY_FIELD_MATCHED',
          equal: true,
        }),
      ]),
    );
  });

  it('allows replay to prove the required filename container fallback', () => {
    const draft = draftEnvelope();
    delete (draft.mappingDefinition as Record<string, unknown>).container;

    expect((service as any).definitionCompletenessIssues(draft)).toEqual([]);
  });

  it('marks parser-relevant carton and volume differences as material', () => {
    const diff = (service as any).buildReplayDiff(
      {
        result: {
          containerNo: 'MANU1234567',
          lines: [],
          destinationSummaries: [
            {
              destinationCode: 'YYC',
              totalCartons: 9,
              totalVolumeCbm: 1.2344,
              packageType: 'PALLET',
            },
          ],
        },
      },
      {
        containerNo: 'MANU1234567',
        detailRows: [],
        destinations: [
          {
            destinationCode: 'YYC',
            destinationType: null,
            packageType: 'PALLET',
            cartons: 10,
            volumeCbm: '1.235',
          },
        ],
        referenceEvidence: [],
      },
    );

    expect(diff.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROFILE_REPLAY_CARTONS_MISMATCH',
          material: true,
        }),
        expect.objectContaining({
          code: 'PROFILE_REPLAY_VOLUME_MISMATCH',
          actual: '1.234',
          expected: '1.235',
          material: true,
        }),
      ]),
    );
  });

  it('blocks source paths outside the configured storage root', async () => {
    prisma.parserLearningCase.findUnique.mockResolvedValue(
      caseRecord({
        sourceImport: {
          ...caseRecord().sourceImport,
          storedPath: '/etc/passwd',
        },
      }),
    );

    await expect(service.inspect('case-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROFILE_STORAGE_PATH_OUTSIDE_ROOT',
      }),
    });
    expect(worker.inspectFile).not.toHaveBeenCalled();
  });

  it('freezes parser-only completion evidence with one replay outbox', async () => {
    prisma.parserLearningCase.findUnique.mockResolvedValue(
      caseRecord({
        linkedContainerId: 'container-manual',
        status: 'AWAITING_COMPLETION',
        draftRevision: 1,
        linkedContainer: {
          ...manualContainer('container-manual'),
          status: 'UNLOADED',
          destinations: [
            {
              id: 'destination-1',
              destinationCode: 'YEG1',
              destinationType: null,
              packageType: 'CARTON',
              cartons: 10,
              volume: '2.500',
              manualPallets: 9,
              finalPallets: 9,
              note: 'physical handling only',
              updatedAt: new Date('2026-07-19T01:00:00.000Z'),
            },
          ],
          lines: [],
        },
        profileVersions: [
          {
            id: 'profile-v1',
            familyId: 'family-1',
            version: 1,
            sourceDraftRevision: 1,
            lifecycle: 'DRAFT',
            trustState: 'REVIEW_REQUIRED',
            mappingVersion: 'mapping-v1',
            matcherVersion: 'matcher-v1',
          },
        ],
      }),
    );
    prisma.correctionFeedback.findMany.mockResolvedValue([
      {
        id: 'correction-parser',
        targetType: 'CONTAINER_DESTINATION',
        containerId: null,
        containerDestinationId: 'destination-1',
        containerLineId: null,
        fieldName: 'cartons',
        createdAt: new Date('2026-07-19T00:00:00.000Z'),
        updatedAt: new Date('2026-07-19T00:00:00.000Z'),
      },
    ]);

    const result = await service.captureCompletionInTransaction(
      prisma,
      'container-manual',
      officeActor,
    );

    expect(result).toMatchObject({
      learningCaseId: 'case-1',
      snapshotCreated: true,
      draftRevision: 1,
    });
    expect(prisma.asyncJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobType: 'PARSER_PROFILE_REPLAY',
        parserLearningCaseId: 'case-1',
        containerId: 'container-manual',
      }),
    });
    const snapshot = prisma.parserLearningCase.updateMany.mock.calls.at(-1)[0]
      .data.completionSnapshot;
    expect(snapshot.destinations[0]).not.toHaveProperty('manualPallets');
    expect(snapshot).not.toHaveProperty('dockNo');
    expect(snapshot.parserRelevantCorrectionRevisions).toEqual([
      expect.objectContaining({ id: 'correction-parser', fieldName: 'cartons' }),
    ]);
  });

  it('reuses the first completion snapshot and its outbox job idempotently', async () => {
    const completionSnapshot = {
      contractVersion: 'parser-completion-snapshot-v1',
      containerNo: 'MANU1234567',
      destinations: [],
      detailRows: [],
      referenceEvidence: [],
    };
    prisma.parserLearningCase.findUnique.mockResolvedValue(
      caseRecord({
        linkedContainerId: 'container-manual',
        linkedContainer: {
          ...manualContainer('container-manual'),
          status: 'LOADED',
        },
        completionSnapshot,
        completionSnapshotAt: new Date('2026-07-19T01:00:00.000Z'),
        completionReplayJobId: 'completion-job',
        profileVersions: [
          {
            id: 'profile-v1',
            sourceDraftRevision: 1,
          },
        ],
      }),
    );
    prisma.asyncJob.findUnique.mockResolvedValue({
      id: 'completion-job',
      metadata: {
        draftRevision: 1,
        replayIdempotencyKey: 'completion-snapshot-1',
      },
    });

    await expect(
      service.captureCompletionInTransaction(
        prisma,
        'container-manual',
        officeActor,
      ),
    ).resolves.toMatchObject({
      learningCaseId: 'case-1',
      snapshotCreated: false,
      jobId: 'completion-job',
      draftRevision: 1,
    });
    expect(prisma.asyncJob.create).not.toHaveBeenCalled();
    expect(prisma.parserLearningCase.updateMany).not.toHaveBeenCalled();
  });

  it('returns a stable warning when snapshot capture fails', async () => {
    prisma.parserLearningCase.findUnique
      .mockRejectedValueOnce(new Error('snapshot unavailable'))
      .mockResolvedValueOnce({ id: 'case-1' });

    await expect(
      service.captureAndDispatchCompletion('container-manual', officeActor),
    ).resolves.toEqual({
      learningCaseId: 'case-1',
      snapshotCreated: false,
      replayJobId: null,
      warningCodes: ['PROFILE_COMPLETION_SNAPSHOT_FAILED'],
    });
  });

  it('never rethrows a secondary warning-write failure after warehouse completion', async () => {
    prisma.parserLearningCase.findUnique
      .mockRejectedValueOnce(new Error('snapshot unavailable'))
      .mockResolvedValueOnce({ id: 'case-1' });
    prisma.parserLearningCase.update.mockRejectedValueOnce(
      new Error('warning write unavailable'),
    );

    await expect(
      service.captureAndDispatchCompletion('container-manual', officeActor),
    ).resolves.toEqual({
      learningCaseId: 'case-1',
      snapshotCreated: false,
      replayJobId: null,
      warningCodes: ['PROFILE_COMPLETION_SNAPSHOT_FAILED'],
    });
  });
});

function createPrismaMock() {
  let currentCase = caseRecord();
  const prisma: any = {
    $transaction: jest.fn((callback) => callback(prisma)),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'import-error' }]),
    importFile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'import-error',
        fileSha256: 'sha-error',
        format: 'UNKNOWN',
        parseStatus: 'ERROR',
      }),
      delete: jest.fn(),
    },
    container: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'container-manual',
        importFileId: null,
        parserSourceKind: 'MANUAL',
        parserVersion: 'manual-entry-v1',
      }),
      delete: jest.fn(),
    },
    parserLearningCase: {
      findUnique: jest
        .fn()
        .mockImplementation(() => Promise.resolve(currentCase)),
      create: jest.fn().mockImplementation(({ data }) => {
        currentCase = caseRecord(data);
        return Promise.resolve(currentCase);
      }),
      updateMany: jest.fn().mockImplementation(({ data }) => {
        currentCase = caseRecord({
          ...currentCase,
          ...data,
          linkedContainer: data.linkedContainerId
            ? manualContainer(data.linkedContainerId)
            : null,
        });
        return Promise.resolve({ count: 1 });
      }),
      update: jest.fn().mockImplementation(({ data }) => {
        currentCase = caseRecord({
          ...currentCase,
          ...data,
          linkedContainer: data.linkedContainerId
            ? currentCase.linkedContainer
            : null,
          sourceImport:
            data.sourceImportId === null ? null : currentCase.sourceImport,
        });
        return Promise.resolve(currentCase);
      }),
    },
    asyncJob: {
      create: jest.fn().mockResolvedValue({ id: 'completion-job' }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    correctionFeedback: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    parserProfileEvidence: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    parserProfileReview: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    parserProfileVersion: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    generatedFile: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    parserProfileAuditEvent: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  return prisma;
}

function caseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    sourceImportId: 'import-error',
    sourceImportReferenceId: 'import-error',
    sourceFileSha256: 'sha-error',
    linkedContainerId: null,
    status: 'OPEN',
    draftRevision: 0,
    activeReplayToken: null,
    lastErrorCode: null,
    draftDefinition: null,
    completionSnapshot: null,
    completionSnapshotAt: null,
    completionReplayJobId: null,
    replaySummary: null,
    createdById: 'auth-office',
    updatedById: 'auth-office',
    closedById: null,
    closedAt: null,
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    sourceImport: {
      id: 'import-error',
      originalFilename: 'unsupported-real.xlsx',
      storedPath: 'unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx',
      fileSha256: 'sha-error',
      format: 'UNKNOWN',
      parseStatus: 'ERROR',
      rawMetadata: { detectorCode: 'UNSUPPORTED_FORMAT' },
    },
    linkedContainer: null,
    profileVersions: [],
    ...overrides,
  };
}

function completeMappingDefinition() {
  return {
    schemaVersion: 'parser-profile-mapping-v1',
    container: { sources: [{ kind: 'cell', cell: 'B3' }] },
    fields: {
      destinationCode: { sources: [{ kind: 'column', header: 'Destination' }] },
      cartons: { sources: [{ kind: 'column', header: 'Cartons' }] },
      volumeCbm: { sources: [{ kind: 'column', header: 'Volume' }] },
    },
  };
}

function draftEnvelope() {
  return {
    mappingDefinition: completeMappingDefinition(),
    fingerprintDefinition: {},
    mappingSchemaVersion: 'parser-profile-mapping-v1',
    fingerprintVersion: 'workbook-fingerprint-v1',
    workerVersion: 'parser-profile-engine-v1',
  };
}

function manualContainer(id: string) {
  return {
    id,
    containerNo: 'MANU1234567',
    sourceFormat: 'UNKNOWN',
    parserSourceKind: 'MANUAL',
    parserVersion: 'manual-entry-v1',
    rawJson: { source: 'manual-unloading-report' },
    importFileId: null,
    status: 'CORRECTED',
    dockNo: null,
    destinations: [],
    lines: [],
  };
}
