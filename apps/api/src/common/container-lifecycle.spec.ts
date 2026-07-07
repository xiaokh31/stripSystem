import { ContainerStatus, PalletStatus } from '../generated/prisma/enums';
import {
  containerStatusFromInventoryCounts,
  effectiveContainerStatus,
  isContainerGenerationLocked,
} from './container-lifecycle';

describe('container lifecycle status', () => {
  it('keeps unloaded containers unloaded until loading evidence exists', () => {
    expect(
      effectiveContainerStatus(ContainerStatus.UNLOADED, [
        {
          pallets: [
            { status: PalletStatus.LABEL_PRINTED },
            { status: PalletStatus.LABEL_PRINTED },
          ],
        },
      ]),
    ).toBe(ContainerStatus.UNLOADED);

    expect(
      containerStatusFromInventoryCounts(2, 0, ContainerStatus.UNLOADED),
    ).toBe(ContainerStatus.UNLOADED);
  });

  it('lets scan inventory state advance unloaded containers into loading states', () => {
    expect(
      effectiveContainerStatus(ContainerStatus.UNLOADED, [
        {
          pallets: [
            { status: PalletStatus.LOADED, loadedAt: new Date() },
            { status: PalletStatus.LABEL_PRINTED },
          ],
        },
      ]),
    ).toBe(ContainerStatus.LOADING_IN_PROGRESS);

    expect(
      containerStatusFromInventoryCounts(2, 2, ContainerStatus.UNLOADED),
    ).toBe(ContainerStatus.LOADED);
    expect(
      containerStatusFromInventoryCounts(2, 1, ContainerStatus.UNLOADED),
    ).toBe(ContainerStatus.LOADING_IN_PROGRESS);
  });

  it('locks report and label regeneration once unloading is completed', () => {
    expect(isContainerGenerationLocked(ContainerStatus.UNLOADED)).toBe(true);
    expect(isContainerGenerationLocked(ContainerStatus.LABELS_GENERATED)).toBe(
      false,
    );
  });
});
