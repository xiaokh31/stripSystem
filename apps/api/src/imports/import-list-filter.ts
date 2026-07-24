import type { Prisma } from '../generated/prisma/client';
import { ImportStatus, ParseStatus } from '../generated/prisma/enums';

export const IMPORT_LIST_IMPORT_STATUSES = Object.values(ImportStatus);
export const IMPORT_LIST_PARSE_STATUSES = Object.values(ParseStatus);

export function importListWhere(
  query: {
    importStatus?: ImportStatus;
    parseStatus?: ParseStatus;
  },
): Prisma.ImportFileWhereInput {
  return {
    deletedAt: null,
    ...(query.importStatus ? { importStatus: query.importStatus } : {}),
    ...(query.parseStatus ? { parseStatus: query.parseStatus } : {}),
  };
}
