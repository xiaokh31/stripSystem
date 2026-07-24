import { attendanceImportListWhere } from '../attendance/attendance-import-list-filter';
import { operationalDayRangeUtc } from '../common/operational-time';
import { ImportStatus, ParseStatus } from '../generated/prisma/enums';
import { importListWhere } from '../imports/import-list-filter';
import { loadJobListWhere } from '../load-jobs/load-job-list-filter';
import { unloadingWageSettlementWhere } from '../unloading-wage/unloading-wage-settlement-filter';

describe('dashboard list predicate contract', () => {
  it('shares active import predicates with import and attendance target lists', () => {
    expect(
      importListWhere({
        importStatus: ImportStatus.UPLOADED,
        parseStatus: ParseStatus.NOT_PARSED,
      }),
    ).toEqual({
      deletedAt: null,
      importStatus: ImportStatus.UPLOADED,
      parseStatus: ParseStatus.NOT_PARSED,
    });
    expect(
      attendanceImportListWhere({ parseStatus: ParseStatus.ERROR }),
    ).toEqual({
      deletedAt: null,
      parseStatus: ParseStatus.ERROR,
    });
  });

  it('shares open, in-progress, and operational due-today load predicates', () => {
    const now = new Date('2026-07-23T18:00:00.000Z');
    expect(loadJobListWhere({ scope: 'OPEN' })).toEqual({
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    });
    expect(loadJobListWhere({ scope: 'IN_PROGRESS' })).toEqual({
      status: 'IN_PROGRESS',
    });
    expect(loadJobListWhere({ scope: 'DUE_TODAY' }, now)).toEqual({
      scheduledDepartureAt: operationalDayRangeUtc(now),
      status: { not: 'CANCELLED' },
    });
  });

  it('shares the cross-month wage review predicate', () => {
    expect(unloadingWageSettlementWhere('NEEDS_REVIEW')).toEqual({
      OR: [{ warningCount: { gt: 0 } }, { errorCount: { gt: 0 } }],
    });
  });
});
