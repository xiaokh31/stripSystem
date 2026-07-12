"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { InventorySyncRefreshListener } from "@/components/inventory/inventory-sync-refresh";
import {
  formatInventoryRefreshTime,
  normalizeInventoryPollingIntervalMs,
} from "./inventory-report-flow";

export function InventoryRefreshControls({
  lastUpdatedAt,
  pollingIntervalMs,
}: {
  lastUpdatedAt: string;
  pollingIntervalMs: number;
}) {
  const { format, t } = useI18n();
  const router = useRouter();
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const [isPending, startTransition] = useTransition();
  const intervalMs = normalizeInventoryPollingIntervalMs(pollingIntervalMs);
  const intervalSeconds = Math.round(intervalMs / 1000);
  const refreshTime = formatInventoryRefreshTime(lastUpdatedAt);
  const pollingText = pollingEnabled
    ? format("i18n.inventory.polling", { seconds: intervalSeconds })
    : t("Polling paused");

  const refreshInventory = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    if (!pollingEnabled) {
      return;
    }

    const intervalId = window.setInterval(refreshInventory, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [intervalMs, pollingEnabled, refreshInventory]);

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <InventorySyncRefreshListener />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("Inventory refresh")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {format("i18n.inventory.lastUpdated", { time: refreshTime })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-11 items-center border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-wait disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={isPending}
            onClick={refreshInventory}
            type="button"
          >
            {isPending ? t("Refreshing") : t("Refresh now")}
          </button>
          <button
            className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            onClick={() => setPollingEnabled((enabled) => !enabled)}
            type="button"
          >
            {pollingText}
          </button>
        </div>
      </div>
    </section>
  );
}
