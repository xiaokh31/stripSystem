import test from "node:test";
import assert from "node:assert/strict";
import {
  ContainerSuggestionCoordinator,
  containerComboboxKeyAction,
  containerSuggestionErrorKey,
  shouldClearContainerSelection,
  type ContainerSuggestion,
} from "../src/components/containers/container-combobox-flow";
import { createTranslator } from "../src/lib/i18n/translator";

const first: ContainerSuggestion = {
  containerId: "container-1",
  containerNo: "AB12",
};

test("container suggestion coordinator debounces to the latest non-empty query", async () => {
  const scheduled: Array<() => void> = [];
  const loaded: string[] = [];
  const results: string[][] = [];
  const coordinator = new ContainerSuggestionCoordinator({
    clearTimer: () => undefined,
    delayMs: 250,
    scheduleTimer: (callback) => {
      scheduled.push(callback);
      return callback;
    },
  });

  coordinator.schedule("A", async (query) => {
    loaded.push(query);
    return [{ containerId: "a", containerNo: query }];
  }, callbacks(results));
  coordinator.schedule("AB", async (query) => {
    loaded.push(query);
    return [{ containerId: "ab", containerNo: query }];
  }, callbacks(results));

  scheduled[0]?.();
  scheduled[1]?.();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(loaded, ["AB"]);
  assert.deepEqual(results, [["AB"]]);
});

test("stale responses cannot replace the latest suggestion result", async () => {
  const scheduled: Array<() => void> = [];
  const pending = new Map<string, (items: ContainerSuggestion[]) => void>();
  const results: string[][] = [];
  const coordinator = new ContainerSuggestionCoordinator({
    clearTimer: () => undefined,
    delayMs: 250,
    scheduleTimer: (callback) => {
      scheduled.push(callback);
      return callback;
    },
  });
  const loader = (query: string) =>
    new Promise<ContainerSuggestion[]>((resolve) => pending.set(query, resolve));

  coordinator.schedule("A", loader, callbacks(results));
  scheduled[0]?.();
  coordinator.schedule("AB", loader, callbacks(results));
  scheduled[1]?.();
  pending.get("AB")?.([{ containerId: "new", containerNo: "AB" }]);
  await Promise.resolve();
  await Promise.resolve();
  pending.get("A")?.([{ containerId: "old", containerNo: "A" }]);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(results, [["AB"]]);
});

test("blank queries reset without scheduling or loading suggestions", () => {
  let resetCount = 0;
  let loaderCount = 0;
  let loadingCount = 0;
  let timerCount = 0;
  const coordinator = new ContainerSuggestionCoordinator({
    scheduleTimer: () => {
      timerCount += 1;
      return timerCount;
    },
  });

  coordinator.schedule(
    "   ",
    async () => {
      loaderCount += 1;
      return [];
    },
    {
      ...callbacks([]),
      onLoading: () => {
        loadingCount += 1;
      },
      onReset: () => {
        resetCount += 1;
      },
    },
  );

  assert.equal(resetCount, 1);
  assert.equal(timerCount, 0);
  assert.equal(loaderCount, 0);
  assert.equal(loadingCount, 0);
});

test("cancel aborts an in-flight request and suppresses its late result", async () => {
  const scheduled: Array<() => void> = [];
  const capturedSignals: AbortSignal[] = [];
  let resolveRequest: ((items: ContainerSuggestion[]) => void) | undefined;
  const results: string[][] = [];
  const coordinator = new ContainerSuggestionCoordinator({
    scheduleTimer: (callback) => {
      scheduled.push(callback);
      return callback;
    },
  });

  coordinator.schedule(
    "AB",
    (_query, signal) => {
      capturedSignals.push(signal);
      return new Promise<ContainerSuggestion[]>((resolve) => {
        resolveRequest = resolve;
      });
    },
    callbacks(results),
  );
  scheduled[0]?.();
  coordinator.cancel();
  resolveRequest?.([{ containerId: "late", containerNo: "AB-LATE" }]);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(capturedSignals[0]?.aborted, true);
  assert.deepEqual(results, []);
});

test("selection identity clears as soon as the user edits canonical text", () => {
  assert.equal(shouldClearContainerSelection(first, "AB12"), false);
  assert.equal(shouldClearContainerSelection(first, "ab12"), true);
  assert.equal(shouldClearContainerSelection(first, "AB123"), true);
  assert.equal(shouldClearContainerSelection(null, "AB123"), false);
});

test("combobox keyboard state wraps arrows and distinguishes select, close, and native submit", () => {
  assert.deepEqual(containerComboboxKeyAction("ArrowDown", -1, 3), {
    activeIndex: 0,
    type: "move",
  });
  assert.deepEqual(containerComboboxKeyAction("ArrowUp", 0, 3), {
    activeIndex: 2,
    type: "move",
  });
  assert.deepEqual(containerComboboxKeyAction("Enter", 2, 3), {
    activeIndex: 2,
    type: "select",
  });
  assert.deepEqual(containerComboboxKeyAction("Enter", -1, 3), {
    activeIndex: -1,
    type: "none",
  });
  assert.deepEqual(containerComboboxKeyAction("Escape", 1, 3), {
    activeIndex: -1,
    type: "close",
  });
  assert.deepEqual(containerComboboxKeyAction("Tab", 1, 3), {
    activeIndex: -1,
    type: "close",
  });
});

test("suggestion error codes map to typed localized message keys", () => {
  assert.equal(
    containerSuggestionErrorKey("FORBIDDEN"),
    "Container suggestions are unavailable for this account.",
  );
  assert.equal(
    containerSuggestionErrorKey("API_NETWORK_ERROR"),
    "Container suggestions could not be loaded. Keep typing to try again.",
  );
  assert.equal(
    containerSuggestionErrorKey("UNEXPECTED_BACKEND_MESSAGE"),
    "Container suggestions could not be loaded. Keep typing to try again.",
  );
  assert.equal(
    createTranslator("en").t(containerSuggestionErrorKey("API_NETWORK_ERROR")),
    "Container suggestions could not be loaded. Keep typing to try again.",
  );
  assert.equal(
    createTranslator("zh-CN").t(
      containerSuggestionErrorKey("API_NETWORK_ERROR"),
    ),
    "无法加载柜号建议，请继续输入重试。",
  );
});

function callbacks(results: string[][]) {
  return {
    onEmpty: () => results.push([]),
    onError: () => undefined,
    onLoading: () => undefined,
    onReset: () => undefined,
    onSuccess: (items: ContainerSuggestion[]) =>
      results.push(items.map((item) => item.containerNo)),
  };
}
