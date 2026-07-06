import { ContainerStatus, PalletStatus } from '../generated/prisma/enums';

export interface PalletLifecycleRecord {
  loadJobId?: string | null;
  loadedAt?: Date | string | null;
  status: string;
}

export interface ContainerDestinationLifecycleRecord {
  pallets?: PalletLifecycleRecord[];
}

export type ContainerStatusValue =
  (typeof ContainerStatus)[keyof typeof ContainerStatus];

const generationLockedStatuses = new Set<string>([
  ContainerStatus.UNLOADED,
  ContainerStatus.LOADING_IN_PROGRESS,
  ContainerStatus.LOADED,
]);
const loadingAuthoritativeStatuses = new Set<string>([
  ContainerStatus.LOADING_IN_PROGRESS,
  ContainerStatus.LOADED,
]);

const reusablePalletStatuses = new Set<string>([
  PalletStatus.PLANNED,
  PalletStatus.LABEL_PRINTED,
]);

export function isContainerGenerationLocked(status: string): boolean {
  return generationLockedStatuses.has(status);
}

export function isPalletReusableForGeneration(
  pallet: PalletLifecycleRecord,
): boolean {
  return (
    reusablePalletStatuses.has(pallet.status) &&
    !pallet.loadJobId &&
    !pallet.loadedAt
  );
}

export function nonReusablePallets(
  destinations: ContainerDestinationLifecycleRecord[],
): PalletLifecycleRecord[] {
  return destinations
    .flatMap((destination) => destination.pallets ?? [])
    .filter((pallet) => !isPalletReusableForGeneration(pallet));
}

export function effectiveContainerStatus(
  status: string,
  destinations: ContainerDestinationLifecycleRecord[],
): string {
  if (loadingAuthoritativeStatuses.has(status)) {
    return status;
  }

  const pallets = destinations.flatMap(
    (destination) => destination.pallets ?? [],
  );
  if (pallets.length === 0) {
    return status;
  }

  const activePallets = pallets.filter(
    (pallet) => pallet.status !== PalletStatus.CANCELLED,
  );
  if (activePallets.length === 0) {
    return status;
  }

  const loadedCount = activePallets.filter(
    (pallet) =>
      pallet.status === PalletStatus.LOADED || Boolean(pallet.loadedAt),
  ).length;
  if (loadedCount >= activePallets.length) {
    return ContainerStatus.LOADED;
  }
  if (
    loadedCount > 0 ||
    activePallets.some(
      (pallet) =>
        pallet.status === PalletStatus.LOADING || Boolean(pallet.loadJobId),
    )
  ) {
    return ContainerStatus.LOADING_IN_PROGRESS;
  }

  return status;
}

export function containerStatusFromInventoryCounts(
  activePalletCount: number,
  loadedPalletCount: number,
  currentStatus?: string | null,
): ContainerStatusValue | null {
  if (activePalletCount <= 0) {
    return null;
  }
  if (loadedPalletCount >= activePalletCount) {
    return ContainerStatus.LOADED;
  }
  if (loadedPalletCount > 0) {
    return ContainerStatus.LOADING_IN_PROGRESS;
  }
  if (currentStatus === ContainerStatus.UNLOADED) {
    return ContainerStatus.UNLOADED;
  }
  return ContainerStatus.LABELS_GENERATED;
}
