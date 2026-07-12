"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { ContainerPalletInventorySyncSummaryResponse } from "@/lib/api-client";
import { summarizeInventorySync } from "./container-unloading-wage-flow";

export function ContainerInventorySyncResult({
  inventorySync,
}: {
  inventorySync: ContainerPalletInventorySyncSummaryResponse[] | null | undefined;
}) {
  const { format, t } = useI18n();
  const summary = summarizeInventorySync(inventorySync);

  if (!summary) {
    return null;
  }

  return (
    <div
      className="mt-3 border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950"
      role="status"
    >
      <p className="font-semibold">
        {format("i18n.inventorySync.completed", {
          destinations: summary.destinationCount,
          pallets: summary.actualPallets,
        })}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer font-medium text-emerald-900">
          {t("i18n.inventorySync.details")}
        </summary>
        <div className="mt-3 divide-y divide-emerald-200 border-y border-emerald-200">
          {summary.destinations.map((destination) => (
            <div
              className="grid gap-2 py-2 sm:grid-cols-4"
              key={`${destination.destinationCode}-${destination.activeTotalPallets}-${destination.createdPallets}-${destination.reusedPallets}`}
            >
              <p className="font-data font-semibold" data-i18n-ignore>
                {destination.destinationCode}
              </p>
              <p>
                {t("i18n.inventorySync.actualPallets")}: {destination.activeTotalPallets}
              </p>
              <p>
                {t("i18n.inventorySync.createdPallets")}: {destination.createdPallets}
              </p>
              <p>
                {t("i18n.inventorySync.reusedPallets")}: {destination.reusedPallets}
              </p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
