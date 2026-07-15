"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ContainerCombobox } from "./container-combobox";
import type { ContainerSuggestion } from "./container-combobox-flow";
import { inventoryWorkspaceHref } from "../reports/inventory-report-flow";
import {
  listContainerSuggestions,
  type InventoryReportFilters,
} from "../../lib/api-client";
import { useI18n } from "../i18n/i18n-provider";

interface InventorySelectionContextValue {
  clearSelection(): void;
  selectedContainerId?: string;
}

const InventorySelectionContext =
  createContext<InventorySelectionContextValue | null>(null);

export function ContainerQuickOpenCombobox({
  initialValue,
}: {
  initialValue?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const loader = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await listContainerSuggestions(query, "containers", {
      signal,
    });
    return response.items;
  }, []);

  return (
    <ContainerCombobox
      initialValue={initialValue}
      key={`quick-open:${initialValue ?? ""}`}
      label={t("Search container index")}
      loader={loader}
      onSelect={(suggestion) =>
        router.push(`/containers/${encodeURIComponent(suggestion.containerId)}`)
      }
    />
  );
}

export function InventoryContainerCombobox({
  filters,
  selectedSuggestion,
}: {
  filters: InventoryReportFilters;
  selectedSuggestion: ContainerSuggestion | null;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const selectionBoundary = useContext(InventorySelectionContext);
  const selectionSourceKey = `${selectedSuggestion?.containerId ?? "none"}:${selectedSuggestion?.containerNo ?? ""}`;
  const [selectionState, setSelectionState] = useState(() => ({
    sourceKey: selectionSourceKey,
    value: selectedSuggestion,
  }));
  const selection =
    selectionState.sourceKey === selectionSourceKey
      ? selectionState.value
      : selectedSuggestion;
  const setSelection = (value: ContainerSuggestion | null) =>
    setSelectionState({ sourceKey: selectionSourceKey, value });

  const loader = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await listContainerSuggestions(query, "inventory", {
      signal,
    });
    return response.items;
  }, []);

  return (
    <>
      {selection ? (
        <input name="containerId" type="hidden" value={selection.containerId} />
      ) : null}
      <ContainerCombobox
        initialValue={filters.containerNo}
        key={`inventory:${selectionSourceKey}:${filters.containerNo ?? ""}`}
        label={t("Container No.")}
        loader={loader}
        onInputValueChange={(value) => {
          if (!selection || value === selection.containerNo) return;
          setSelection(null);
          selectionBoundary?.clearSelection();
          window.history.replaceState(
            null,
            "",
            inventoryWorkspaceHref(
              { ...filters, containerNo: value || undefined },
              undefined,
            ),
          );
        }}
        onSelect={(suggestion) => {
          setSelection(suggestion);
          router.push(
            inventoryWorkspaceHref(
              { ...filters, containerNo: suggestion.containerNo },
              suggestion.containerId,
            ),
          );
        }}
        selectedSuggestion={selectedSuggestion}
      />
    </>
  );
}

export function InventorySelectionBoundary({
  children,
  selectedContainerId,
}: {
  children: ReactNode;
  selectedContainerId?: string;
}) {
  const [selectionState, setSelectionState] = useState(() => ({
    activeContainerId: selectedContainerId,
    sourceContainerId: selectedContainerId,
  }));
  const activeContainerId =
    selectionState.sourceContainerId === selectedContainerId
      ? selectionState.activeContainerId
      : selectedContainerId;
  const value = useMemo(
    () => ({
      clearSelection: () =>
        setSelectionState({
          activeContainerId: undefined,
          sourceContainerId: selectedContainerId,
        }),
      selectedContainerId: activeContainerId,
    }),
    [activeContainerId, selectedContainerId],
  );

  return (
    <InventorySelectionContext.Provider value={value}>
      {children}
    </InventorySelectionContext.Provider>
  );
}

export function InventorySelectedContainerContent({
  children,
}: {
  children: ReactNode;
}) {
  const selection = useContext(InventorySelectionContext);
  const { t } = useI18n();
  if (selection?.selectedContainerId) return children;

  return (
    <section className="border border-dashed border-zinc-300 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase text-amber-800">
        {t("Container selection")}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-950">
        {t("Select an exact container")}
      </h2>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        {t(
          "Choose a container from the table to review its destination inventory and adjustment history.",
        )}
      </p>
    </section>
  );
}
