import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  activeInventoryFilterCount,
  formatInventoryRefreshTime,
  inventoryWorkspaceHref,
  normalizeInventoryFilters,
  normalizeInventoryPagination,
  normalizeInventorySelection,
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

test("inventory workspace href preserves API filters and exact container selection", () => {
  assert.equal(
    inventoryWorkspaceHref(
      {
        containerNo: "CSNU8877228",
        destinationCode: "YEG1",
        status: "LABEL_PRINTED",
      },
      "container_cuid_123",
    ),
    "/inventory?containerNo=CSNU8877228&destinationCode=YEG1&status=LABEL_PRINTED&containerId=container_cuid_123&page=1&pageSize=10&sortBy=createdAt&sortDirection=desc",
  );
});

test("inventory composite scope and dashboard context survive pagination and sorting", () => {
  const filters = normalizeInventoryFilters({
    code: "INVENTORY_DESTINATION_REMAINING",
    destinationCode: " YYC ",
    from: "dashboard",
    scope: "REMAINING",
  });
  assert.deepEqual(filters, {
    code: "INVENTORY_DESTINATION_REMAINING",
    destinationCode: "YYC",
    from: "dashboard",
    scope: "REMAINING",
  });
  assert.equal(
    inventoryWorkspaceHref(filters, undefined, {
      page: 3,
      pageSize: 20,
      sortBy: "status",
      sortDirection: "asc",
    }),
    "/inventory?destinationCode=YYC&scope=REMAINING&from=dashboard&code=INVENTORY_DESTINATION_REMAINING&page=3&pageSize=20&sortBy=status&sortDirection=asc",
  );
  assert.equal(activeInventoryFilterCount(filters), 2);
});

test("inventory exact suggestion selection stores canonical container text with stable identity", () => {
  assert.equal(
    inventoryWorkspaceHref(
      {
        containerNo: "CSNU8877228",
        destinationCode: "YEG1",
        status: "LABEL_PRINTED",
      },
      "container-id-1",
    ),
    "/inventory?containerNo=CSNU8877228&destinationCode=YEG1&status=LABEL_PRINTED&containerId=container-id-1&page=1&pageSize=10&sortBy=createdAt&sortDirection=desc",
  );
  assert.equal(
    inventoryWorkspaceHref(
      { containerNo: "CSNU8", destinationCode: "YEG1" },
      undefined,
    ),
    "/inventory?containerNo=CSNU8&destinationCode=YEG1&page=1&pageSize=10&sortBy=createdAt&sortDirection=desc",
  );
});

test("inventory combobox restores the stable selection boundary before URL navigation", () => {
  const source = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/components/containers/container-search-controls.tsx",
    ),
    "utf8",
  );

  assert.match(source, /selectContainer\(containerId: string\): void;/);
  assert.match(
    source,
    /selectionBoundary\?\.selectContainer\(suggestion\.containerId\);\s*router\.push\(/,
  );
});

test("inventory pagination normalizes defaults and rejects unstable URL values", () => {
  assert.deepEqual(normalizeInventoryPagination({}), {
    page: 1,
    pageSize: 10,
    sortBy: "createdAt",
    sortDirection: "desc",
  });
  assert.deepEqual(
    normalizeInventoryPagination({
      page: "3",
      pageSize: "50",
      sortBy: "containerNo",
      sortDirection: "asc",
    }),
    {
      page: 3,
      pageSize: 50,
      sortBy: "containerNo",
      sortDirection: "asc",
    },
  );
  assert.deepEqual(
    normalizeInventoryPagination({
      page: "0",
      pageSize: "25",
      sortBy: "translated-status",
      sortDirection: "sideways",
    }),
    {
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortDirection: "desc",
    },
  );
});

test("inventory URLs preserve page, sorting, filters, and exact selection", () => {
  assert.equal(
    inventoryWorkspaceHref(
      { containerNo: "AB 12", destinationCode: "YEG1" },
      "container-id",
      { page: 4, pageSize: 20, sortBy: "status", sortDirection: "asc" },
    ),
    "/inventory?containerNo=AB+12&destinationCode=YEG1&containerId=container-id&page=4&pageSize=20&sortBy=status&sortDirection=asc",
  );
});

test("inventory selection uses the first trimmed stable container id", () => {
  assert.equal(
    normalizeInventorySelection({
      containerId: [" container_cuid_123 ", "container_cuid_456"],
    }),
    "container_cuid_123",
  );
  assert.equal(normalizeInventorySelection({ containerId: "   " }), undefined);
});

test("inventory pallet status options keep loaded filter available", () => {
  const optionValues = PALLET_STATUS_OPTIONS.map(
    (option) => option.value as string,
  );

  assert.equal(optionValues.includes("LOADED"), true);
  assert.equal(optionValues.includes("ADJUSTED_OUT"), true);
  assert.equal(optionValues.includes("UNLOADED"), false);
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
