"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";
import { browserLogout } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  const { t } = useI18n();

  async function handleLogout() {
    try {
      await browserLogout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      className="min-h-9 border border-white/20 bg-white px-3 text-xs font-semibold uppercase text-[var(--surface-action-foreground)] hover:bg-zinc-100"
      onClick={handleLogout}
      type="button"
    >
      {t("Sign out")}
    </button>
  );
}
