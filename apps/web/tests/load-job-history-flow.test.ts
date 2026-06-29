import test from "node:test";
import assert from "node:assert/strict";
import {
  LOAD_JOB_HISTORY_PAGE_SIZE,
  activeLoadJobHistoryFilterCount,
  loadJobHistoryHref,
  normalizeLoadJobHistoryFilters,
} from "../src/components/load-jobs/load-job-history-flow";

test("load job history filters trim query values and constrain offset", () => {
  assert.deepEqual(
    normalizeLoadJobHistoryFilters({
      destinationRegion: " YEG1 ",
      loadNo: " LOAD-1 ",
      offset: "25",
      status: " COMPLETED ",
    }),
    {
      destinationRegion: "YEG1",
      limit: LOAD_JOB_HISTORY_PAGE_SIZE,
      loadNo: "LOAD-1",
      offset: 25,
      status: "COMPLETED",
    },
  );

  assert.equal(
    normalizeLoadJobHistoryFilters({ offset: "-10" }).offset,
    0,
  );
});

test("load job history href preserves filters and pagination", () => {
  assert.equal(
    loadJobHistoryHref({
      destinationRegion: "YEG1",
      loadNo: "LOAD-1",
      offset: 25,
      status: "COMPLETED",
    }),
    "/load-jobs/history?loadNo=LOAD-1&destinationRegion=YEG1&status=COMPLETED&offset=25",
  );

  assert.equal(loadJobHistoryHref({ offset: 0 }), "/load-jobs/history");
});

test("active load job history filter count ignores pagination", () => {
  assert.equal(
    activeLoadJobHistoryFilterCount({
      destinationRegion: "YEG1",
      limit: LOAD_JOB_HISTORY_PAGE_SIZE,
      offset: 25,
      status: "IN_PROGRESS",
    }),
    2,
  );
});
