import type { Prisma } from '../generated/prisma/client';
import { LoadJobStatus } from '../generated/prisma/enums';
import { operationalDayRangeUtc } from '../common/operational-time';

export const LOAD_JOB_LIST_SCOPES = [
  'OPEN',
  'IN_PROGRESS',
  'DUE_TODAY',
] as const;
export type LoadJobListScope = (typeof LOAD_JOB_LIST_SCOPES)[number];

export function loadJobListWhere(
  query: {
    containerId?: string;
    loadNo?: string;
    destinationRegion?: string;
    status?: string;
    scope?: LoadJobListScope;
    selectedId?: string;
  },
  now = new Date(),
): Prisma.LoadJobWhereInput {
  const where: Prisma.LoadJobWhereInput = {};
  if (query.containerId) {
    where.OR = [
      { containerId: query.containerId },
      { lines: { some: { containerId: query.containerId } } },
    ];
  }
  if (query.loadNo) where.jobNo = query.loadNo;
  if (query.destinationRegion) {
    where.destinationRegion = query.destinationRegion;
  }
  if (query.selectedId) where.id = query.selectedId;
  if (query.status) where.status = query.status as LoadJobStatus;
  if (query.scope === 'OPEN') {
    where.status = {
      in: [LoadJobStatus.PLANNED, LoadJobStatus.IN_PROGRESS],
    };
  } else if (query.scope === 'IN_PROGRESS') {
    where.status = LoadJobStatus.IN_PROGRESS;
  } else if (query.scope === 'DUE_TODAY') {
    where.status = { not: LoadJobStatus.CANCELLED };
    where.scheduledDepartureAt = operationalDayRangeUtc(now);
  }
  return where;
}
