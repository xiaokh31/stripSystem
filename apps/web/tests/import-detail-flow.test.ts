import test from "node:test";
import assert from "node:assert/strict";
import {
  canTriggerParse,
  containerLinks,
  issueList,
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
    },
  ]);

  assert.deepEqual(links, [
    {
      href: "/containers/container-1",
      label: "CSNU8877228",
    },
  ]);
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
