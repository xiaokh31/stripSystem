"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ContainerSuggestionCoordinator,
  containerComboboxKeyAction,
  containerSuggestionErrorKey,
  shouldClearContainerSelection,
  type ContainerSuggestion,
  type ContainerSuggestionLoader,
} from "./container-combobox-flow";
import { useI18n } from "../i18n/i18n-provider";

type SuggestionStatus = "empty" | "error" | "idle" | "loading" | "ready";

export function ContainerCombobox({
  initialValue = "",
  inputClassName,
  label,
  loader,
  name = "containerNo",
  onInputValueChange,
  onSelect,
  placeholder,
  selectedSuggestion = null,
}: {
  initialValue?: string;
  inputClassName?: string;
  label: string;
  loader: ContainerSuggestionLoader;
  name?: string;
  onInputValueChange?(value: string): void;
  onSelect(suggestion: ContainerSuggestion): void;
  placeholder?: string;
  selectedSuggestion?: ContainerSuggestion | null;
}) {
  const { format, t } = useI18n();
  const generatedId = useId().replace(/:/g, "");
  const inputId = `container-combobox-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const instructionsId = `${inputId}-instructions`;
  const rootRef = useRef<HTMLDivElement>(null);
  const coordinatorRef = useRef(new ContainerSuggestionCoordinator());
  const [activeIndex, setActiveIndex] = useState(-1);
  const [errorCode, setErrorCode] = useState("CONTAINER_SUGGESTIONS_FAILED");
  const [items, setItems] = useState<ContainerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] =
    useState<ContainerSuggestion | null>(selectedSuggestion);
  const [status, setSuggestionStatus] = useState<SuggestionStatus>("idle");
  const [value, setValue] = useState(
    selectedSuggestion?.containerNo ?? initialValue,
  );

  const dismiss = useCallback(() => {
    coordinatorRef.current.cancel();
    setActiveIndex(-1);
    setItems([]);
    setOpen(false);
    setSuggestionStatus("idle");
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        dismiss();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [dismiss]);

  useEffect(
    () => () => {
      coordinatorRef.current.cancel();
    },
    [],
  );

  const choose = (suggestion: ContainerSuggestion) => {
    coordinatorRef.current.cancel();
    setActiveIndex(-1);
    setItems([]);
    setOpen(false);
    setSelection(suggestion);
    setSuggestionStatus("idle");
    setValue(suggestion.containerNo);
    onSelect(suggestion);
  };

  const schedule = (nextValue: string) => {
    coordinatorRef.current.schedule(nextValue, loader, {
      onEmpty: () => {
        setActiveIndex(-1);
        setItems([]);
        setOpen(true);
        setSuggestionStatus("empty");
      },
      onError: (code) => {
        setActiveIndex(-1);
        setErrorCode(code);
        setItems([]);
        setOpen(true);
        setSuggestionStatus("error");
      },
      onLoading: () => {
        setActiveIndex(-1);
        setItems([]);
        setOpen(true);
        setSuggestionStatus("loading");
      },
      onReset: () => {
        setActiveIndex(-1);
        setItems([]);
        setOpen(false);
        setSuggestionStatus("idle");
      },
      onSuccess: (nextItems) => {
        setActiveIndex(-1);
        setItems(nextItems);
        setOpen(true);
        setSuggestionStatus("ready");
      },
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = containerComboboxKeyAction(
      event.key,
      activeIndex,
      items.length,
    );
    if (action.type === "move") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(action.activeIndex);
      return;
    }
    if (action.type === "select") {
      event.preventDefault();
      const suggestion = items[action.activeIndex];
      if (suggestion) choose(suggestion);
      return;
    }
    if (action.type === "close") {
      if (event.key === "Escape") event.preventDefault();
      dismiss();
    }
  };

  return (
    <div className="relative grid gap-2" ref={rootRef}>
      <label className="text-sm font-medium text-zinc-700" htmlFor={inputId}>
        {label}
      </label>
      <input
        aria-activedescendant={
          open && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-describedby={instructionsId}
        aria-expanded={open}
        autoComplete="off"
        className={
          inputClassName ??
          "min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700"
        }
        id={inputId}
        name={name}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (shouldClearContainerSelection(selection, nextValue)) {
            setSelection(null);
          }
          setValue(nextValue);
          onInputValueChange?.(nextValue);
          schedule(nextValue);
        }}
        onFocus={() => {
          if (value.trim() && status !== "idle") setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? t("Enter a container number")}
        role="combobox"
        type="search"
        value={value}
      />
      <span className="sr-only" id={instructionsId}>
        {t("Use the up and down arrow keys to review container suggestions.")}
      </span>

      {open ? (
        <div
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border border-zinc-300 bg-white shadow-xl"
          data-container-suggestion-popover="true"
        >
          {status === "loading" ? (
            <SuggestionState>{t("Loading container suggestions")}</SuggestionState>
          ) : null}
          {status === "empty" ? (
            <SuggestionState>{t("No matching containers")}</SuggestionState>
          ) : null}
          {status === "error" ? (
            <SuggestionState alert>
              {t(containerSuggestionErrorKey(errorCode))}
            </SuggestionState>
          ) : null}
          {status === "ready" ? (
            <p className="sr-only" role="status">
              {format("i18n.containerCombobox.resultCount", {
                count: items.length,
              })}
            </p>
          ) : null}
          <ul
            aria-busy={status === "loading" || undefined}
            aria-label={t("Container suggestions")}
            hidden={status !== "ready"}
            id={listboxId}
            role="listbox"
          >
            {status === "ready"
              ? items.map((item, index) => (
                  <li
                    aria-selected={index === activeIndex}
                    className={[
                      "cursor-pointer border-b border-zinc-100 px-3 py-3 font-mono text-sm font-semibold text-zinc-950 last:border-b-0",
                      index === activeIndex
                        ? "bg-teal-50 text-teal-950"
                        : "bg-white",
                    ].join(" ")}
                    id={`${listboxId}-option-${index}`}
                    key={item.containerId}
                    onClick={() => choose(item)}
                    onMouseDown={(event) => event.preventDefault()}
                    role="option"
                  >
                    {item.containerNo}
                  </li>
                ))
              : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SuggestionState({
  alert = false,
  children,
}: {
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <p
      className="break-words px-3 py-3 text-sm leading-5 text-zinc-600"
      role={alert ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
