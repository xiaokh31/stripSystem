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
      className="min-h-9 border border-teal-600 bg-teal-950 px-3 text-xs font-semibold uppercase text-teal-50 hover:bg-teal-800"
      onClick={handleLogout}
      type="button"
    >
      Logout
    </button>
  );
}
