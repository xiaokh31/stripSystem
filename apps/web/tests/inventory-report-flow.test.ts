import test from "node:test";
import assert from "node:assert/strict";
import {
  activeInventoryFilterCount,
  inventoryReportHref,
  normalizeInventoryFilters,
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
      { loadedPallets: 1, remainingPallets: 4, totalPallets: 5 },
      { loadedPallets: 2, remainingPallets: 0, totalPallets: 2 },
    ]),
    {
      loadedPallets: 3,
      remainingPallets: 4,
      totalPallets: 7,
    },
  );
});
