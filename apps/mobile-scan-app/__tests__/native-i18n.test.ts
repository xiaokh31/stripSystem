import test from "node:test";
import assert from "node:assert/strict";
import {
  assertNativeCatalogParity,
  loadNativeLocale,
  nativeApiErrorMessage,
  nativeLocaleStorageKey,
  saveNativeLocale,
  t,
} from "../src/i18n/native-i18n";
import { initialNativeScreen, resolveNativeScreen } from "../src/app/navigation";
import { MemorySettingsStore } from "../src/storage/settings-store";

test("native locale catalogs have matching keys and render one selected language", () => {
  assert.doesNotThrow(assertNativeCatalogParity);
  assert.equal(t("en", "loadJobs"), "Load jobs");
  assert.equal(t("zh-CN", "loadJobs"), "装车任务");
  assert.equal(t("zh-CN", "pendingCount", { count: 2 }), "2 条扫描正在等待服务器确认。");
});

test("native locale persists in the settings store", async () => {
  const store = new MemorySettingsStore();
  await saveNativeLocale(store, "zh-CN");
  assert.equal(await store.getItem(nativeLocaleStorageKey), "zh-CN");
  assert.equal(await loadNativeLocale(store), "zh-CN");
});

test("stable API codes map to local operator messages without backend fallback text", () => {
  assert.equal(nativeApiErrorMessage("en", "INVALID_CREDENTIALS"), "Email or password is incorrect.");
  assert.equal(nativeApiErrorMessage("zh-CN", "INVALID_CREDENTIALS"), "账号或密码不正确。");
  assert.equal(nativeApiErrorMessage("zh-CN", "UNKNOWN_BACKEND_CODE"), "操作未完成。请重试或在设置中检查连接。");
});

test("navigation sends saved sessions to load jobs and protects scan without a selected job", () => {
  const loggedOut = { message: "", status: "logged_out" as const, user: null };
  const signedIn = { message: "", status: "authenticated" as const, user: { id: "u", email: null, name: null, permissions: [], roles: [] } };
  assert.equal(initialNativeScreen(loggedOut), "login");
  assert.equal(initialNativeScreen(signedIn), "load-jobs");
  assert.equal(resolveNativeScreen({ requested: "settings", selectedLoadJob: null, session: loggedOut }), "settings");
  assert.equal(resolveNativeScreen({ requested: "scan", selectedLoadJob: null, session: signedIn }), "load-jobs");
});
