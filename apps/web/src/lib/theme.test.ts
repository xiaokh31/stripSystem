import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeThemePreference,
  resolveTheme,
  themeColorScheme,
  themeCookieValue,
} from "./theme";

test("theme preference defaults safely to system", () => {
  assert.equal(normalizeThemePreference(undefined), "system");
  assert.equal(normalizeThemePreference("invalid"), "system");
  assert.equal(normalizeThemePreference("dark"), "dark");
});

test("theme cookie resolver ignores unrelated cookies", () => {
  assert.equal(themeCookieValue("bestar_locale=zh-CN; bestar_theme=dark"), "dark");
  assert.equal(themeCookieValue("bestar_locale=en"), null);
  assert.equal(themeCookieValue("bestar_theme=%E0%A4%A"), "system");
});

test("system theme follows the operating system while manual choices override it", () => {
  assert.equal(resolveTheme("system", "light"), "light");
  assert.equal(resolveTheme("system", "dark"), "dark");
  assert.equal(resolveTheme("light", "dark"), "light");
  assert.equal(resolveTheme("dark", "light"), "dark");
});

test("color scheme advertises both system variants without changing the preference", () => {
  assert.equal(themeColorScheme("light"), "light");
  assert.equal(themeColorScheme("dark"), "dark");
  assert.equal(themeColorScheme("system"), "light dark");
});
