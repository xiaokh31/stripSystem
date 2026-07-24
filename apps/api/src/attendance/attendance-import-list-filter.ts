import type { Prisma } from '../generated/prisma/client';
import { ParseStatus } from '../generated/prisma/enums';

export const ATTENDANCE_IMPORT_PARSE_STATUSES = Object.values(ParseStatus);

export function attendanceImportListWhere(
  query: { parseStatus?: ParseStatus },
): Prisma.AttendanceImportWhereInput {
  return {
    deletedAt: null,
    ...(query.parseStatus ? { parseStatus: query.parseStatus } : {}),
  };
}
