import { BadRequestException, ConflictException } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CorrectionsService', () => {
  const officeActor = {
    id: 'auth-office',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: ['containers.update', 'corrections.create'],
  };
  let prisma: any;
  let service: CorrectionsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new CorrectionsService(prisma as PrismaService);
  });

  it('updates manualPallets, recalculates finalPallets, and writes audit rows', async () => {
    const result = await service.updateContainerDestination(
      'destination-1',
      {
        manualPallets: 7,
        reason: 'Office review',
        correctionNote: 'Customer confirmed pallet split',
        correctedById: 'spoofed-user',
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      id: 'destination-1',
      manualPallets: 7,
      finalPallets: 7,
    });
    expect(result.corrections).toHaveLength(2);
    expect(result.corrections.map((record) => record.fieldName)).toEqual([
      'manualPallets',
      'finalPallets',
    ]);
    expect(prisma.correctionFeedback.create).toHaveBeenCalledTimes(2);
    expect(
      prisma.correctionFeedback.create.mock.calls.map(
        (call) => call[0].data.correctedById,
      ),
    ).toEqual(['auth-office', 'auth-office']);
    expect(prisma.container.update).toHaveBeenCalledWith({
      where: { id: 'container-1' },
      data: { status: 'CORRECTED' },
    });
  });

  it('clears manualPallets and restores calculated finalPallets', async () => {
    const destination = containersFixture(prisma)[0].destinations[0];
    Object.assign(destination, {
      calculatedPallets: 4,
      manualPallets: 7,
      finalPallets: 7,
    });

    const result = await service.updateContainerDestination(
      'destination-1',
      {
        manualPallets: null,
        reason: 'Remove manual override',
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      manualPallets: null,
      finalPallets: 4,
    });
    expect(result.corrections.map((record) => record.fieldName)).toEqual([
      'manualPallets',
      'finalPallets',
    ]);
  });

  it('rejects zero manualPallets and tells the user to delete empty destinations', async () => {
    await expect(
      service.updateContainerDestination(
        'destination-1',
        {
          manualPallets: 0,
          reason: 'No cargo on destination',
        },
        officeActor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVALID_MANUAL_PALLETS',
        details: { fieldName: 'manualPallets' },
      }),
    });
    expect(prisma.containerDestination.update).not.toHaveBeenCalled();
    expect(prisma.correctionFeedback.create).not.toHaveBeenCalled();
  });

  it('updates actual note only and writes destination audit feedback', async () => {
    const result = await service.updateContainerDestination(
      'destination-1',
      {
        correctionNote: 'Office saved actual unloading note',
        note: '  Revised actual unloading note  ',
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      id: 'destination-1',
      note: 'Revised actual unloading note',
    });
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0]).toMatchObject({
      containerId: 'container-1',
      containerDestinationId: 'destination-1',
      fieldName: 'note',
      oldValue: null,
      newValue: 'Revised actual unloading note',
      note: 'Office saved actual unloading note',
    });
    expect(prisma.containerDestination.update).toHaveBeenCalledWith({
      where: { id: 'destination-1' },
      data: { note: 'Revised actual unloading note' },
    });
  });

  it('updates packageType, recalculates address pallets, and writes audit rows', async () => {
    const destination = containersFixture(prisma)[0].destinations[0];
    Object.assign(destination, {
      destinationCode: 'Private Address / WB-PILOT',
      destinationType: 'PARCEL_PRIVATE',
      packageType: 'UNKNOWN',
      cartons: 7,
      volume: '3.610',
      calculatedPallets: 3,
      finalPallets: 3,
      palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
      calculationBasisCbm: '1.800',
      roundingMode: 'CEIL',
      warnings: [
        {
          code: 'PACKAGE_TYPE_CONFIRMATION_REQUIRED',
          field: 'packageType',
          message:
            'Private or commercial address package type was not recognized; manual confirmation is required.',
        },
      ],
    });

    const result = await service.updateContainerDestination(
      'destination-1',
      {
        correctionNote: 'Pilot workbook review confirmed wooden crate',
        packageType: 'WOODEN_CRATE',
        reason: 'Package type pilot correction',
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      id: 'destination-1',
      packageType: 'WOODEN_CRATE',
      calculatedPallets: 7,
      finalPallets: 7,
      palletRuleCode: 'ADDRESS_WOODEN_CRATE_PIECE_COUNT',
      calculationBasisCbm: null,
      roundingMode: 'PIECE_COUNT',
    });
    expect(result.corrections.map((record) => record.fieldName)).toEqual([
      'packageType',
      'calculatedPallets',
      'palletRuleCode',
      'calculationBasisCbm',
      'roundingMode',
      'warnings',
      'finalPallets',
    ]);
    expect(result.corrections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: 'packageType',
          oldValue: 'UNKNOWN',
          newValue: 'WOODEN_CRATE',
        }),
        expect.objectContaining({
          fieldName: 'warnings',
          newValue: [],
        }),
      ]),
    );
    expect(prisma.containerDestination.update).toHaveBeenCalledWith({
      where: { id: 'destination-1' },
      data: expect.objectContaining({
        calculatedPallets: 7,
        finalPallets: 7,
        packageType: 'WOODEN_CRATE',
        palletRuleCode: 'ADDRESS_WOODEN_CRATE_PIECE_COUNT',
        calculationBasisCbm: null,
        roundingMode: 'PIECE_COUNT',
        warnings: [],
      }),
    });
  });

  it('keeps manual pallet override when packageType correction changes calculated pallets', async () => {
    const destination = containersFixture(prisma)[0].destinations[0];
    Object.assign(destination, {
      destinationCode: 'Private Address / WB-MANUAL',
      destinationType: 'PARCEL_PRIVATE',
      packageType: 'UNKNOWN',
      cartons: 7,
      volume: '3.610',
      calculatedPallets: 3,
      manualPallets: 2,
      finalPallets: 2,
      palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
      calculationBasisCbm: '1.800',
      roundingMode: 'CEIL',
      warnings: [
        {
          code: 'PACKAGE_TYPE_CONFIRMATION_REQUIRED',
          field: 'packageType',
          message:
            'Private or commercial address package type was not recognized; manual confirmation is required.',
        },
      ],
    });

    const result = await service.updateContainerDestination(
      'destination-1',
      {
        packageType: 'WOODEN_CRATE',
        reason: 'Package type pilot correction',
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      packageType: 'WOODEN_CRATE',
      calculatedPallets: 7,
      manualPallets: 2,
      finalPallets: 2,
      palletRuleCode: 'ADDRESS_WOODEN_CRATE_PIECE_COUNT',
      roundingMode: 'PIECE_COUNT',
    });
    expect(result.corrections.map((record) => record.fieldName)).not.toContain(
      'finalPallets',
    );
  });

  it('recalculates historical unknown package destinations as carton without packageType input', async () => {
    const destination = containersFixture(prisma)[0].destinations[0];
    Object.assign(destination, {
      destinationCode: 'Private Address / WB-HISTORICAL',
      destinationType: 'PARCEL_PRIVATE',
      packageType: 'UNKNOWN',
      cartons: 7,
      volume: '3.610',
      calculatedPallets: 3,
      finalPallets: 3,
      palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
      calculationBasisCbm: '1.800',
      roundingMode: 'CEIL',
      warnings: [
        {
          code: 'PACKAGE_TYPE_CONFIRMATION_REQUIRED',
          field: 'packageType',
          message:
            'Private or commercial address package type was not recognized; manual confirmation is required.',
        },
      ],
    });

    const result = await service.updateContainerDestination(
      'destination-1',
      {
        cartons: 10,
        volume: 3.61,
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      packageType: 'CARTON',
      calculatedPallets: 3,
      finalPallets: 3,
      palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
      roundingMode: 'CEIL',
    });
    expect(result.corrections.map((record) => record.fieldName)).toEqual([
      'cartons',
      'warnings',
    ]);
    expect(prisma.containerDestination.update).toHaveBeenCalledWith({
      where: { id: 'destination-1' },
      data: expect.objectContaining({
        cartons: 10,
        warnings: [],
      }),
    });
  });

  it('recalculates UPS courier destinations with carton rule during corrections', async () => {
    const destination = containersFixture(prisma)[0].destinations[0];
    Object.assign(destination, {
      destinationCode: 'UPS',
      destinationType: 'PARCEL_PRIVATE',
      packageType: 'UNKNOWN',
      cartons: 57,
      volume: '5.390',
      calculatedPallets: 0,
      manualPallets: null,
      finalPallets: 0,
      palletRuleCode: null,
      calculationBasisCbm: null,
      roundingMode: null,
      warnings: [],
    });

    const result = await service.updateContainerDestination(
      'destination-1',
      {
        volume: 5.4,
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      destinationCode: 'UPS',
      packageType: 'CARTON',
      calculatedPallets: 3,
      finalPallets: 3,
      palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
      calculationBasisCbm: '1.800',
      roundingMode: 'CEIL',
    });
    expect(result.corrections.map((record) => record.fieldName)).toEqual([
      'volume',
      'calculatedPallets',
      'palletRuleCode',
      'calculationBasisCbm',
      'roundingMode',
      'finalPallets',
    ]);
  });

  it('updates actual cartons only and recalculates pallets with warnings', async () => {
    const destination = containersFixture(prisma)[0].destinations[0];
    Object.assign(destination, {
      destinationCode: 'YEG1',
      destinationType: 'WAREHOUSE',
      cartons: 0,
      volume: '0.000',
      calculatedPallets: 0,
      finalPallets: 0,
      palletRuleCode: 'YEG1_VOLUME_1_7_PLUS_5',
      calculationBasisCbm: '1.700',
      roundingMode: 'CEIL',
      warnings: [],
    });

    const result = await service.updateContainerDestination(
      'destination-1',
      {
        cartons: 6,
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      cartons: 6,
      calculatedPallets: 6,
      finalPallets: 6,
      palletRuleCode: 'YEG1_VOLUME_1_7_PLUS_5',
    });
    expect(result.corrections.map((record) => record.fieldName)).toEqual([
      'cartons',
      'calculatedPallets',
      'warnings',
      'finalPallets',
    ]);
    expect(result.corrections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: 'warnings',
          newValue: [
            expect.objectContaining({
              code: 'ZERO_VOLUME_WITH_CARTONS',
              field: 'volume',
            }),
          ],
        }),
      ]),
    );
  });

  it('updates actual CBM only and recalculates pallets', async () => {
    const destination = containersFixture(prisma)[0].destinations[0];
    Object.assign(destination, {
      destinationCode: 'YYC4',
      cartons: 8,
      volume: '3.390',
      calculatedPallets: 2,
      finalPallets: 2,
      palletRuleCode: 'VOLUME_1_7',
      calculationBasisCbm: '1.700',
      roundingMode: 'CEIL',
      warnings: [],
    });

    const result = await service.updateContainerDestination(
      'destination-1',
      {
        volume: 3.41,
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      volume: '3.410',
      calculatedPallets: 3,
      finalPallets: 3,
      palletRuleCode: 'VOLUME_1_7',
    });
    expect(result.corrections.map((record) => record.fieldName)).toEqual([
      'volume',
      'calculatedPallets',
      'finalPallets',
    ]);
  });

  it('reads full container detail with destination correction fields', async () => {
    const result = await service.getContainer('container-1');

    expect(result).toMatchObject({
      id: 'container-1',
      containerNo: 'CSNU8877228',
      company: 'BESTAR',
      status: 'PARSED',
      totalCartons: 40,
      totalVolumeCbm: '5.250',
      unloadingWage: null,
      destinations: [
        {
          id: 'destination-1',
          destinationCode: 'YYZ',
          destinationType: 'AMAZON_FBA',
          packageType: 'CARTON',
          totalCartons: 40,
          totalVolumeCbm: '5.250',
          calculatedPallets: 4,
          manualPallets: null,
          finalPallets: 4,
          palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
          calculationBasisCbm: '1.800',
          roundingMode: 'CEIL',
        },
      ],
    });
    expect(prisma.container.findUnique).toHaveBeenCalledWith({
      where: { id: 'container-1' },
      include: {
        destinations: {
          include: {
            pallets: {
              select: {
                status: true,
                loadJobId: true,
                loadedAt: true,
              },
            },
          },
          orderBy: [
            { destinationCode: 'asc' },
            { destinationType: 'asc' },
            { packageType: 'asc' },
          ],
        },
        payContainerLinks: {
          include: {
            payContainer: {
              include: {
                sourceContainers: {
                  orderBy: {
                    containerNo: 'asc',
                  },
                },
                unloaders: {
                  orderBy: {
                    workerName: 'asc',
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  });

  it('creates a manual unloading container with destinations and audit rows', async () => {
    const result = await service.createManualContainer(
      {
        containerNo: 'MANU1234567',
        company: 'Manual Customer',
        dockNo: 'D7',
        reason: 'Original manifest could not be parsed',
        correctionNote: 'Created from office manual entry',
        destinations: [
          {
            destinationCode: 'YEG1',
            destinationType: 'WAREHOUSE',
            cartons: 36,
            pallets: 4,
            note: 'Manual report line',
          },
          {
            destinationCode: 'YVR2',
            cartons: 12,
            pallets: 2,
            volume: 1.5,
          },
        ],
      },
      officeActor,
    );

    expect(result.container).toMatchObject({
      importFileId: null,
      containerNo: 'MANU1234567',
      dockNo: 'D7',
      company: 'Manual Customer',
      sourceFormat: 'UNKNOWN',
      parserVersion: 'manual-entry-v1',
      status: 'CORRECTED',
      totalCartons: 48,
      totalVolumeCbm: '1.500',
      destinations: [
        expect.objectContaining({
          destinationCode: 'YEG1',
          packageType: 'CARTON',
          totalCartons: 36,
          totalVolumeCbm: '0.000',
          calculatedPallets: 6,
          manualPallets: 4,
          finalPallets: 4,
          palletRuleCode: 'YEG1_VOLUME_1_7_PLUS_5',
        }),
        expect.objectContaining({
          destinationCode: 'YVR2',
          packageType: 'CARTON',
          totalCartons: 12,
          totalVolumeCbm: '1.500',
          calculatedPallets: 1,
          manualPallets: 2,
          finalPallets: 2,
          palletRuleCode: 'VOLUME_2_2',
        }),
      ],
    });
    expect(result.corrections.map((record) => record.fieldName)).toEqual([
      'manualContainer',
      'manualContainerDestination',
      'manualContainerDestination',
    ]);
    expect(prisma.container.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        containerNo: 'MANU1234567',
        sourceFormat: 'UNKNOWN',
        parserVersion: 'manual-entry-v1',
        status: 'CORRECTED',
      }),
    });
    expect(prisma.containerDestination.create).toHaveBeenCalledTimes(2);
    expect(prisma.containerDestination.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        containerId: result.container.id,
        destinationCode: 'YEG1',
        packageType: 'CARTON',
        cartons: 36,
        calculatedPallets: 6,
        manualPallets: 4,
        finalPallets: 4,
        palletRuleCode: 'YEG1_VOLUME_1_7_PLUS_5',
      }),
    });
    expect(prisma.containerDestination.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        containerId: result.container.id,
        destinationCode: 'YVR2',
        packageType: 'CARTON',
        cartons: 12,
        volume: '1.500',
        calculatedPallets: 1,
        manualPallets: 2,
        finalPallets: 2,
        palletRuleCode: 'VOLUME_2_2',
      }),
    });
    expect(prisma.correctionFeedback.create).toHaveBeenCalledTimes(3);
    expect(
      prisma.correctionFeedback.create.mock.calls.every(
        (call) => call[0].data.correctedById === 'auth-office',
      ),
    ).toBe(true);
  });

  it('rejects zero pallets when creating a manual unloading container', async () => {
    await expect(
      service.createManualContainer(
        {
          containerNo: 'MANU1234567',
          destinations: [
            {
              destinationCode: 'YEG1',
              cartons: 0,
              pallets: 0,
            },
          ],
          reason: 'No cargo on destination',
        },
        officeActor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVALID_MANUAL_PALLETS',
        details: { fieldName: 'destinations[1].pallets' },
      }),
    });
    expect(prisma.container.create).not.toHaveBeenCalled();
    expect(prisma.containerDestination.create).not.toHaveBeenCalled();
    expect(prisma.correctionFeedback.create).not.toHaveBeenCalled();
  });

  it('updates container lifecycle status and writes audit feedback', async () => {
    const result = await service.updateContainer(
      'container-1',
      {
        correctionNote: 'Reset after test label generation',
        reason: 'Office lifecycle correction',
        status: 'LABELS_GENERATED',
      },
      officeActor,
    );

    expect(result.container).toMatchObject({
      id: 'container-1',
      status: 'LABELS_GENERATED',
    });
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0]).toMatchObject({
      containerId: 'container-1',
      fieldName: 'status',
      oldValue: 'PARSED',
      newValue: 'LABELS_GENERATED',
    });
  });

  it('allows manual UNLOADED status and writes audit feedback', async () => {
    const result = await service.updateContainer(
      'container-1',
      {
        correctionNote: 'Unloading completed by warehouse manager',
        reason: 'Office unloading lifecycle correction',
        status: 'UNLOADED',
      },
      officeActor,
    );

    expect(result.container).toMatchObject({
      id: 'container-1',
      status: 'UNLOADED',
    });
    expect(result.corrections[0]).toMatchObject({
      containerId: 'container-1',
      fieldName: 'status',
      oldValue: 'PARSED',
      newValue: 'UNLOADED',
    });
  });

  it('rejects manual LOADED status when pallets remain unloaded', async () => {
    containersFixture(prisma)[0].destinations[0].pallets = [
      {
        loadJobId: null,
        loadedAt: null,
        status: 'LABEL_PRINTED',
      },
    ];

    await expect(
      service.updateContainer(
        'container-1',
        {
          status: 'LOADED',
        },
        officeActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects manual LOADED status even when all pallets are loaded by scan', async () => {
    containersFixture(prisma)[0].destinations[0].pallets = [
      {
        loadJobId: 'load-job-1',
        loadedAt: new Date('2026-06-27T11:00:00.000Z'),
        status: 'LOADED',
      },
    ];

    await expect(
      service.updateContainer(
        'container-1',
        {
          status: 'LOADED',
        },
        officeActor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTAINER_STATUS_LOADED_SCAN_ONLY',
      }),
    });
  });

  it('creates a manual actual unloading destination and writes audit rows', async () => {
    const result = await service.createContainerDestination(
      'container-1',
      {
        cartons: 12,
        correctionNote: 'Added from returned paper report',
        destinationCode: 'MANUAL-YYZ',
        destinationType: 'WAREHOUSE',
        manualPallets: 2,
        note: 'Actual unloading entry',
        volume: 1.25,
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      containerId: 'container-1',
      destinationCode: 'MANUAL-YYZ',
      packageType: 'CARTON',
      cartons: 12,
      volume: '1.250',
      calculatedPallets: 1,
      manualPallets: 2,
      finalPallets: 2,
      palletRuleCode: 'UNKNOWN_DESTINATION_VOLUME_1_7',
    });
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0]).toMatchObject({
      containerId: 'container-1',
      containerDestinationId: result.containerDestination.id,
      fieldName: 'containerDestination',
    });
  });

  it('rejects zero manualPallets when adding an actual unloading destination', async () => {
    await expect(
      service.createContainerDestination(
        'container-1',
        {
          cartons: 0,
          destinationCode: 'MANUAL-EMPTY',
          manualPallets: 0,
          volume: 0,
        },
        officeActor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVALID_MANUAL_PALLETS',
        details: { fieldName: 'manualPallets' },
      }),
    });
    expect(prisma.containerDestination.create).not.toHaveBeenCalled();
    expect(prisma.correctionFeedback.create).not.toHaveBeenCalled();
  });

  it('creates a private address destination without packageType as default carton', async () => {
    const result = await service.createContainerDestination(
      'container-1',
      {
        cartons: 10,
        destinationCode: 'Private Address / WB-DEFAULT-CARTON',
        destinationType: 'PARCEL_PRIVATE',
        volume: 3.61,
      },
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      containerId: 'container-1',
      destinationCode: 'Private Address / WB-DEFAULT-CARTON',
      packageType: 'CARTON',
      cartons: 10,
      volume: '3.610',
      calculatedPallets: 3,
      manualPallets: null,
      finalPallets: 3,
      palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
      calculationBasisCbm: '1.800',
      roundingMode: 'CEIL',
    });
    expect(prisma.containerDestination.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        packageType: 'CARTON',
        calculatedPallets: 3,
        finalPallets: 3,
        warnings: [],
      }),
    });
  });

  it('deletes an editable destination, removes rebuildable planning rows, and writes audit rows', async () => {
    const result = await service.deleteContainerDestination(
      'destination-1',
      officeActor,
    );

    expect(result.containerDestination).toMatchObject({
      id: 'destination-1',
      containerId: 'container-1',
      destinationCode: 'YYZ',
    });
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0]).toMatchObject({
      containerId: 'container-1',
      containerDestinationId: 'destination-1',
      fieldName: 'containerDestination',
      newValue: null,
    });
    expect(prisma.pallet.deleteMany).toHaveBeenCalledWith({
      where: { containerDestinationId: 'destination-1' },
    });
    expect(prisma.loadJobLine.deleteMany).toHaveBeenCalledWith({
      where: { containerDestinationId: 'destination-1' },
    });
    expect(prisma.containerDestination.delete).toHaveBeenCalledWith({
      where: { id: 'destination-1' },
    });
    expect(prisma.container.update).toHaveBeenCalledWith({
      where: { id: 'container-1' },
      data: { status: 'CORRECTED' },
    });
  });

  it('rejects corrections when no value changes', async () => {
    await expect(
      service.updateContainerDestination(
        'destination-1',
        {
          manualPallets: null,
        },
        officeActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.correctionFeedback.create).not.toHaveBeenCalled();
  });

  it('rejects destination corrections after loading has started', async () => {
    containersFixture(prisma)[0].status = 'LOADING_IN_PROGRESS';
    prisma.containerDestination.findUnique.mockResolvedValueOnce({
      id: 'destination-1',
      containerId: 'container-1',
      destinationCode: 'YYZ',
      destinationType: 'AMAZON_FBA',
      packageType: 'CARTON',
      cartons: 40,
      volume: '5.250',
      calculatedPallets: 4,
      manualPallets: null,
      finalPallets: 4,
      palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
      calculationBasisCbm: '1.800',
      roundingMode: 'CEIL',
      note: null,
      warnings: [],
      errors: [],
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
      updatedAt: new Date('2026-06-26T00:00:00.000Z'),
      container: {
        status: 'LOADING_IN_PROGRESS',
      },
    });

    await expect(
      service.updateContainerDestination(
        'destination-1',
        {
          manualPallets: 7,
        },
        officeActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.containerDestination.update).not.toHaveBeenCalled();
    expect(prisma.correctionFeedback.create).not.toHaveBeenCalled();
  });

  function createPrismaMock() {
    const containers = [
      {
        id: 'container-1',
        importFileId: 'import-1',
        containerNo: 'CSNU8877228',
        dockNo: null,
        company: 'BESTAR',
        sourceFormat: 'UNLOADING_PLAN_CN',
        parserVersion: 'unloading-plan-cn-v1',
        status: 'PARSED',
        rawJson: {},
        warnings: [],
        errors: [],
        destinations: [] as any[],
        createdAt: new Date('2026-06-26T00:00:00.000Z'),
        updatedAt: new Date('2026-06-26T00:00:00.000Z'),
      },
    ];
    const destination = {
      id: 'destination-1',
      containerId: 'container-1',
      destinationCode: 'YYZ',
      destinationType: 'AMAZON_FBA',
      packageType: 'CARTON',
      cartons: 40,
      volume: '5.250',
      calculatedPallets: 4,
      manualPallets: null,
      finalPallets: 4,
      palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
      calculationBasisCbm: '1.800',
      roundingMode: 'CEIL',
      note: null,
      warnings: [],
      errors: [],
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
      updatedAt: new Date('2026-06-26T00:00:00.000Z'),
    };
    const corrections: any[] = [];
    let manualDestinationCount = 0;
    containers[0].destinations = [destination];

    const mock: any = {
      __containers: containers,
      $transaction: jest.fn((callback) => callback(mock)),
      container: {
        create: jest.fn(({ data }) => {
          const created = {
            id: `container-${containers.length + 1}`,
            importFileId: null,
            ...data,
            destinations: [],
            createdAt: new Date('2026-06-26T00:01:00.000Z'),
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          };
          containers.push(created);
          return Promise.resolve(created);
        }),
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            containers.find((container) => container.id === where.id) ?? null,
          ),
        ),
        update: jest.fn(({ where, data }) => {
          const container = containers.find((item) => item.id === where.id);
          if (!container) {
            throw new Error(`Container not found: ${where.id}`);
          }
          Object.assign(container, data, {
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          });
          return Promise.resolve({
            ...container,
            destinations: undefined,
          });
        }),
      },
      containerDestination: {
        findUnique: jest.fn().mockResolvedValue(destination),
        create: jest.fn(({ data }) => {
          manualDestinationCount += 1;
          const created = {
            id: `destination-created-${manualDestinationCount}`,
            ...data,
            createdAt: new Date('2026-06-26T00:01:00.000Z'),
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          };
          const container = containers.find(
            (record) => record.id === data.containerId,
          );
          container?.destinations.push(created);
          return Promise.resolve(created);
        }),
        update: jest.fn(({ data }) => {
          Object.assign(destination, data, {
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          });
          return Promise.resolve(destination);
        }),
        delete: jest.fn(({ where }) => {
          const container = containers.find(
            (record) => record.id === destination.containerId,
          );
          if (container) {
            container.destinations = container.destinations.filter(
              (item: any) => item.id !== where.id,
            );
          }
          return Promise.resolve(destination);
        }),
      },
      loadJobLine: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      pallet: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      correctionFeedback: {
        create: jest.fn(({ data }) => {
          const record = {
            id: `correction-${corrections.length + 1}`,
            importFileId: null,
            containerLineId: null,
            palletId: null,
            generatedFileId: null,
            ...data,
            createdAt: new Date('2026-06-26T00:01:00.000Z'),
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          };
          corrections.push(record);
          return Promise.resolve(record);
        }),
      },
    };

    return mock;
  }
});

function containersFixture(prisma: any): any[] {
  return prisma.__containers as any[];
}
