import type { MessageKey } from "../../lib/i18n/catalog";

export interface ContainerSuggestion {
  containerId: string;
  containerNo: string;
}

export type ContainerSuggestionLoader = (
  query: string,
  signal: AbortSignal,
) => Promise<ContainerSuggestion[]>;

interface CoordinatorCallbacks {
  onEmpty(): void;
  onError(code: string): void;
  onLoading(): void;
  onReset(): void;
  onSuccess(items: ContainerSuggestion[]): void;
}

interface CoordinatorOptions {
  clearTimer?: (handle: unknown) => void;
  delayMs?: number;
  scheduleTimer?: (callback: () => void, delayMs: number) => unknown;
}

export class ContainerSuggestionCoordinator {
  private abortController: AbortController | null = null;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly delayMs: number;
  private requestSequence = 0;
  private readonly scheduleTimer: (
    callback: () => void,
    delayMs: number,
  ) => unknown;
  private timer: unknown = null;

  constructor(options: CoordinatorOptions = {}) {
    this.clearTimer =
      options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.delayMs = options.delayMs ?? 250;
    this.scheduleTimer =
      options.scheduleTimer ??
      ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  }

  schedule(
    query: string,
    loader: ContainerSuggestionLoader,
    callbacks: CoordinatorCallbacks,
  ): void {
    const normalizedQuery = query.trim();
    const sequence = ++this.requestSequence;
    this.clearPendingWork();

    if (!normalizedQuery) {
      callbacks.onReset();
      return;
    }

    callbacks.onLoading();
    this.timer = this.scheduleTimer(() => {
      this.timer = null;
      if (sequence !== this.requestSequence) return;

      const abortController = new AbortController();
      this.abortController = abortController;
      void loader(normalizedQuery, abortController.signal)
        .then((items) => {
          if (sequence !== this.requestSequence) return;
          this.abortController = null;
          if (items.length === 0) {
            callbacks.onEmpty();
          } else {
            callbacks.onSuccess(items);
          }
        })
        .catch((error: unknown) => {
          if (sequence !== this.requestSequence || isAbortError(error)) return;
          this.abortController = null;
          callbacks.onError(errorCode(error));
        });
    }, this.delayMs);
  }

  cancel(): void {
    this.requestSequence += 1;
    this.clearPendingWork();
  }

  private clearPendingWork(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }
}

export type ContainerComboboxKeyAction =
  | { activeIndex: number; type: "move" | "select" }
  | { activeIndex: -1; type: "close" | "none" };

export function containerComboboxKeyAction(
  key: string,
  activeIndex: number,
  itemCount: number,
): ContainerComboboxKeyAction {
  if (key === "Escape" || key === "Tab") {
    return { activeIndex: -1, type: "close" };
  }
  if (key === "Enter") {
    return activeIndex >= 0 && activeIndex < itemCount
      ? { activeIndex, type: "select" }
      : { activeIndex: -1, type: "none" };
  }
  if (itemCount === 0) {
    return { activeIndex: -1, type: "none" };
  }
  if (key === "ArrowDown") {
    return {
      activeIndex: activeIndex >= itemCount - 1 ? 0 : activeIndex + 1,
      type: "move",
    };
  }
  if (key === "ArrowUp") {
    return {
      activeIndex: activeIndex <= 0 ? itemCount - 1 : activeIndex - 1,
      type: "move",
    };
  }
  return { activeIndex: -1, type: "none" };
}

export function shouldClearContainerSelection(
  selection: ContainerSuggestion | null,
  inputValue: string,
): boolean {
  return selection !== null && inputValue !== selection.containerNo;
}

const suggestionErrorKeys: Partial<Record<string, MessageKey>> = {
  FORBIDDEN: "Container suggestions are unavailable for this account.",
};

export function containerSuggestionErrorKey(code: string): MessageKey {
  return (
    suggestionErrorKeys[code] ??
    "Container suggestions could not be loaded. Keep typing to try again."
  );
}

function errorCode(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "CONTAINER_SUGGESTIONS_FAILED";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
