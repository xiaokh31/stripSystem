"use client";

import { useRouter } from "next/navigation";
import { clearBrowserAuthToken } from "@/lib/auth-token";

export function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    clearBrowserAuthToken();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      className="min-h-9 border border-white/20 bg-white px-3 text-xs font-semibold uppercase text-[var(--dock-steel)] hover:bg-zinc-100"
      onClick={handleLogout}
      type="button"
    >
      Sign out
    </button>
  );
}
