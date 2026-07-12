import assert from "node:assert/strict";
import test from "node:test";
import { readLocaleCookie } from "./browser";

test("locale cookie is the stable SSR-compatible browser locale source", () => {
  assert.equal(readLocaleCookie("bestar_locale=zh-CN"), "zh-CN");
  assert.equal(readLocaleCookie("other=value; bestar_locale=en"), "en");
  assert.equal(readLocaleCookie("other=value"), null);
});
