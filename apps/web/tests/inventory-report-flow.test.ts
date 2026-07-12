import test from "node:test";
import assert from "node:assert/strict";
import {
  activeInventoryFilterCount,
  formatInventoryRefreshTime,
  inventoryReportHref,
  normalizeInventoryFilters,
  normalizeInventoryPollingIntervalMs,
  PALLET_STATUS_OPTIONS,
  sumPalletStats,
} from "../src/components/reports/inventory-report-flow";

test("inventory filters trim values and drop blanks", () => {
  assert.deepEqual(
    normalizeInventoryFilters({
      containerNo: " CSNU8877228 ",
      destinationCode: " ",
      status: ["LABEL_PRINTED", "LOADED"],
    }),
    {
      containerNo: "CSNU8877228",
      status: "LABEL_PRINTED",
    },
  );
});

test("inventory report href preserves API filter names", () => {
  assert.equal(
    inventoryReportHref({
      containerNo: "CSNU8877228",
      destinationCode: "YEG1",
      status: "LABEL_PRINTED",
    }),
    "/reports/inventory?containerNo=CSNU8877228&destinationCode=YEG1&status=LABEL_PRINTED",
  );
});

test("inventory pallet status options keep loaded filter available", () => {
  const optionValues = PALLET_STATUS_OPTIONS.map(
    (option) => option.value as string,
  );

  assert.equal(optionValues.includes("LOADED"), true);
  assert.equal(optionValues.includes("ADJUSTED_OUT"), true);
  assert.equal(optionValues.includes("UNLOADED"), false);
  assert.equal(
    inventoryReportHref({ status: "LOADED" }),
    "/reports/inventory?status=LOADED",
  );
});

test("active filter count ignores blank optional filters", () => {
  assert.equal(
    activeInventoryFilterCount({
      containerNo: "CSNU",
      destinationCode: "",
      status: "LOADED",
    }),
    2,
  );
});

test("pallet summary totals use API supplied remaining counts", () => {
  assert.deepEqual(
    sumPalletStats([
      {
        adjustedOutPallets: 1,
        activeTotalPallets: 5,
        cancelledPallets: 0,
        loadedPallets: 1,
        remainingPallets: 4,
        totalPallets: 6,
      },
      {
        adjustedOutPallets: 0,
        activeTotalPallets: 2,
        cancelledPallets: 1,
        loadedPallets: 2,
        remainingPallets: 0,
        totalPallets: 3,
      },
    ]),
    {
      adjustedOutPallets: 1,
      activeTotalPallets: 7,
      cancelledPallets: 1,
      loadedPallets: 3,
      remainingPallets: 4,
      totalPallets: 9,
    },
  );
});

test("inventory polling interval is constrained to the supported range", () => {
  assert.equal(normalizeInventoryPollingIntervalMs(undefined), 15_000);
  assert.equal(normalizeInventoryPollingIntervalMs(5_000), 10_000);
  assert.equal(normalizeInventoryPollingIntervalMs(20_250.4), 20_250);
  assert.equal(normalizeInventoryPollingIntervalMs(45_000), 30_000);
});

test("inventory refresh time is formatted in dynamic Edmonton daylight time", () => {
  assert.equal(
    formatInventoryRefreshTime("2026-06-27T21:05:09.000Z"),
    "2026-06-27 15:05:09 MDT",
  );
  assert.equal(formatInventoryRefreshTime("not-a-date"), "not-a-date");
});
