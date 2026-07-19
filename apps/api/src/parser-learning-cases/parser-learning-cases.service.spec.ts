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
  let service: ParserLearningCasesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ParserLearningCasesService(prisma);
  });

  it('idempotently returns the active case for the same failed import', async () => {
    const existing = caseRecord();
    prisma.parserLearningCase.findUnique.mockResolvedValue(existing);

    await expect(service.start('import-error', officeActor)).resolves.toEqual(
      expect.objectContaining({
        id: 'case-1',
        sourceImportId: 'import-error',
        status: 'DRAFT',
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
      status: 'LINKED',
      linkedContainer: { id: 'container-manual' },
    });
    expect(prisma.parserLearningCase.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'case-1', linkedContainerId: null }),
      data: expect.objectContaining({
        linkedContainerId: 'container-manual',
        status: 'LINKED',
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
        status: 'LINKED',
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
          status: 'LINKED',
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
      expect.objectContaining({ status: 'DRAFT', linkedContainer: null }),
    );
    await expect(
      service.close('case-1', 'OBSOLETE_DRAFT', officeActor),
    ).resolves.toEqual(expect.objectContaining({ status: 'CLOSED' }));

    expect(prisma.parserLearningCase.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'case-1' },
      data: expect.objectContaining({
        linkedContainerId: null,
        status: 'DRAFT',
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
    parserProfileEvidence: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    parserProfileVersion: {
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
    status: 'DRAFT',
    draftDefinition: null,
    completionSnapshot: null,
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
      format: 'UNKNOWN',
      parseStatus: 'ERROR',
      rawMetadata: { detectorCode: 'UNSUPPORTED_FORMAT' },
    },
    linkedContainer: null,
    ...overrides,
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
  };
}
