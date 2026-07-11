import assert from "node:assert/strict";
import test from "node:test";
import { isOfficeNavItemActive } from "../src/components/layout/office-navigation-flow";

test("office navigation active state handles root and nested routes", () => {
  assert.equal(isOfficeNavItemActive("/", "/"), true);
  assert.equal(isOfficeNavItemActive("/imports", "/"), false);
  assert.equal(isOfficeNavItemActive("/imports", "/imports"), true);
  assert.equal(isOfficeNavItemActive("/imports/import-1", "/imports"), true);
  assert.equal(isOfficeNavItemActive("/imports-new", "/imports"), false);
});
