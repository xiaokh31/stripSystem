"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";

const INVENTORY_SYNC_EVENT = "bestar:inventory-synchronized";
const INVENTORY_SYNC_STORAGE_KEY = "bestar.inventory-synchronized-at";
const INVENTORY_SYNC_CHANNEL = "bestar-inventory-synchronized";

export function publishInventorySyncRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  const timestamp = String(Date.now());
  window.dispatchEvent(new Event(INVENTORY_SYNC_EVENT));

  try {
    window.localStorage.setItem(INVENTORY_SYNC_STORAGE_KEY, timestamp);
  } catch {
    // Storage can be unavailable in hardened browser profiles.
  }

  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(INVENTORY_SYNC_CHANNEL);
    channel.postMessage(timestamp);
    channel.close();
  }
}

/** Refreshes server-rendered inventory views when unloading changes pallet rows elsewhere. */
export function InventorySyncRefreshListener() {
  const { locale } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    const refresh = () => {
      startTransition(() => router.refresh());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === INVENTORY_SYNC_STORAGE_KEY) {
        refresh();
      }
    };

    window.addEventListener(INVENTORY_SYNC_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    const channel =
      "BroadcastChannel" in window
        ? new BroadcastChannel(INVENTORY_SYNC_CHANNEL)
        : null;
    channel?.addEventListener("message", refresh);

    return () => {
      window.removeEventListener(INVENTORY_SYNC_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, [locale, router, startTransition]);

  return null;
}
