import test from "node:test";
import assert from "node:assert/strict";
import {
  getAppStyles,
  getNativeThemeTokens,
  resolveNativeColorScheme,
} from "../src/ui/styles";

test("native theme resolves light, dark, and null system schemes", () => {
  assert.equal(resolveNativeColorScheme("light"), "light");
  assert.equal(resolveNativeColorScheme("dark"), "dark");
  assert.equal(resolveNativeColorScheme(null), "light");
});

test("native theme tokens have light and dark parity with readable surfaces", () => {
  const light = getNativeThemeTokens("light");
  const dark = getNativeThemeTokens("dark");
  assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort());
  assert.notEqual(light.background, dark.background);
  assert.notEqual(light.textPrimary, dark.textPrimary);
  assert.notEqual(light.textOnAction, dark.textOnAction);
  assert.equal(getAppStyles("dark").screen.backgroundColor, dark.background);
  assert.equal(getAppStyles("light").screen.backgroundColor, light.background);
  assert.equal(getAppStyles("dark").buttonText.width, "100%");
  assert.equal(getAppStyles("dark").secondaryButtonText.width, "100%");
});

test("native header gives the localized brand remaining width without shrinking settings", () => {
  const styles = getAppStyles("dark");
  assert.equal(styles.appHeader.flexDirection, "row");
  assert.equal(styles.appHeaderBrand.flexGrow, 1);
  assert.equal(styles.appHeaderBrand.flexShrink, 1);
  assert.equal(styles.appHeaderBrand.minWidth, 0);
  assert.equal(styles.iconButton.width, 44);
  assert.equal(styles.iconButton.height, 44);
});
