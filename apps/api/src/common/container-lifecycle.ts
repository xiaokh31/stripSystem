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

export interface ContainerLifecycleAggregate {
  activePalletCount: number;
  hasLoadingSignal: boolean;
  loadedPalletCount: number;
}

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
  const pallets = destinations.flatMap(
    (destination) => destination.pallets ?? [],
  );
  const activePallets = pallets.filter(
    (pallet) =>
      pallet.status !== PalletStatus.CANCELLED &&
      pallet.status !== PalletStatus.ADJUSTED_OUT,
  );
  const loadedCount = activePallets.filter(
    (pallet) =>
      pallet.status === PalletStatus.LOADED || Boolean(pallet.loadedAt),
  ).length;

  return effectiveContainerStatusFromAggregate(status, {
    activePalletCount: activePallets.length,
    hasLoadingSignal: activePallets.some(
      (pallet) =>
        pallet.status === PalletStatus.LOADING || Boolean(pallet.loadJobId),
    ),
    loadedPalletCount: loadedCount,
  });
}

export function effectiveContainerStatusFromAggregate(
  status: string,
  aggregate: ContainerLifecycleAggregate,
): string {
  if (loadingAuthoritativeStatuses.has(status)) {
    return status;
  }
  if (aggregate.activePalletCount <= 0) {
    return status;
  }
  if (aggregate.loadedPalletCount >= aggregate.activePalletCount) {
    return ContainerStatus.LOADED;
  }
  if (aggregate.loadedPalletCount > 0 || aggregate.hasLoadingSignal) {
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
