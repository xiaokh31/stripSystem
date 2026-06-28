import type { ReactNode } from "react";
import { OfficeNavigation, type OfficeNavItem } from "./office-navigation";

const navItems: OfficeNavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/imports", label: "Imports" },
  { href: "/containers", label: "Containers" },
  { href: "/load-jobs", label: "Load Jobs" },
  { href: "/reports", label: "Reports" },
  { href: "/mobile/load-jobs", label: "Mobile Scan" },
  { href: "/settings", label: "Settings" },
];

export function OfficeShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 text-zinc-950">
      <header className="border-b border-teal-950 bg-teal-900 text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-teal-100">
                Bestar Service CCA
              </p>
              <p className="text-lg font-semibold">Warehouse Office</p>
            </div>
            <div className="border border-teal-700 bg-teal-800 px-3 py-2 text-xs font-semibold uppercase text-teal-50">
              Live API
            </div>
          </div>
          <OfficeNavigation items={navItems} />
        </div>
      </header>
      {children}
    </div>
  );
}
