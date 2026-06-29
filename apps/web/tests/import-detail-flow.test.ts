import test from "node:test";
import assert from "node:assert/strict";
import {
  canTriggerParse,
  containerLinks,
  formatDateTime,
  issueList,
  manualReportHref,
  shouldOfferManualReportEntry,
  statusTone,
} from "../src/components/imports/import-detail-flow";

test("parse action is disabled only while parsing", () => {
  assert.equal(canTriggerParse("NOT_PARSED"), true);
  assert.equal(canTriggerParse("ERROR"), true);
  assert.equal(canTriggerParse("PARSING"), false);
});

test("parse status maps to visible tones", () => {
  assert.equal(statusTone("PARSED"), "emerald");
  assert.equal(statusTone("WARNING"), "emerald");
  assert.equal(statusTone("PARSING"), "amber");
  assert.equal(statusTone("ERROR"), "red");
  assert.equal(statusTone("NOT_PARSED"), "zinc");
});

test("parsed containers produce detail links", () => {
  const links = containerLinks([
    {
      id: "container-1",
      containerNo: "CSNU8877228",
      status: "PARSED",
    },
  ]);

  assert.deepEqual(links, [
    {
      href: "/containers/container-1",
      label: "CSNU8877228 · PARSED",
    },
  ]);
});

test("manual report fallback panel appears after parse failure or empty parsed result", () => {
  assert.equal(
    shouldOfferManualReportEntry({
      parseResult: null,
      parseStatus: "NOT_PARSED",
    }),
    false,
  );
  assert.equal(
    shouldOfferManualReportEntry({
      parseResult: null,
      parseStatus: "ERROR",
    }),
    true,
  );
  assert.equal(
    shouldOfferManualReportEntry({
      parseResult: { containers: [] },
      parseStatus: "WARNING",
    }),
    true,
  );
  assert.equal(
    shouldOfferManualReportEntry({
      parseResult: {
        containers: [
          { id: "container-1", containerNo: "CSNU8877228", status: "PARSED" },
        ],
      },
      parseStatus: "WARNING",
    }),
    false,
  );
});

test("manual report link carries the source import id", () => {
  assert.equal(
    manualReportHref("import 1/2"),
    "/containers/new?fromImport=import%201%2F2",
  );
});

test("import timestamps are formatted in dynamic Edmonton daylight time", () => {
  assert.equal(
    formatDateTime("2026-06-27T21:05:09.000Z"),
    "2026-06-27 15:05:09 MDT",
  );
});

test("import timestamps are formatted in dynamic Edmonton standard time", () => {
  assert.equal(
    formatDateTime("2026-01-27T21:05:09.000Z"),
    "2026-01-27 14:05:09 MST",
  );
  assert.equal(formatDateTime("not-a-date"), "not-a-date");
});

test("issue lists preserve parser warning and error messages", () => {
  assert.deepEqual(
    issueList([
      {
        code: "MISSING_CONTAINER_NO",
        field: "containerNo",
        message: "Worker parsed the file without a container number.",
      },
      "plain warning",
    ]),
    ["Worker parsed the file without a container number.", "plain warning"],
  );
});
