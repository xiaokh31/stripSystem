import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import type { AuthUserResponse } from "@/lib/api-client";
import {
  canManageAccounts,
  canManageOfficeLoadJobs,
  canReviewUnloadingWage,
  canReviewWorkHours,
  hasPermission,
} from "@/lib/permissions";
import { OfficeNavigation, type OfficeNavItem } from "./office-navigation";

interface PermissionAwareNavItem extends OfficeNavItem {
  requiredPermissions?: string[];
}

const navItems: PermissionAwareNavItem[] = [
  { href: "/", label: "Dashboard" },
  {
    href: "/imports",
    label: "Imports",
    requiredPermissions: ["imports.read"],
  },
  {
    href: "/containers",
    label: "Containers",
    requiredPermissions: ["containers.read"],
  },
  {
    href: "/load-jobs",
    label: "Load Jobs",
    requiredPermissions: ["load_jobs.create"],
  },
  {
    href: "/work-hours",
    label: "Work Hours",
    requiredPermissions: ["attendance.read"],
  },
  {
    href: "/unloading-wage",
    label: "Unloading Wage",
    requiredPermissions: ["unloading_wage.read"],
  },
  {
    href: "/reports",
    label: "Reports",
    requiredPermissions: ["inventory.read"],
  },
  {
    href: "/mobile/load-jobs",
    label: "Mobile Scan",
    requiredPermissions: ["scan.create"],
  },
  { href: "/settings", label: "Settings" },
  {
    href: "/admin/users",
    label: "Admin",
    requiredPermissions: ["users.manage", "roles.manage"],
  },
];

export function OfficeShell({
  children,
  currentUser,
}: {
  children: ReactNode;
  currentUser: AuthUserResponse | null;
}) {
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
            {currentUser ? (
              <div className="flex flex-wrap items-center gap-2">
                <LanguageSwitcher />
                <div className="border border-teal-700 bg-teal-800 px-3 py-2 text-xs text-teal-50">
                  <p className="font-semibold">
                    {currentUser.name ?? currentUser.email ?? "Signed in"}
                  </p>
                  <p className="mt-1 uppercase">
                    {currentUser.roles.join(", ")}
                  </p>
                </div>
                <LogoutButton />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <LanguageSwitcher />
                <a
                  className="inline-flex min-h-9 items-center border border-teal-700 bg-teal-800 px-3 text-xs font-semibold uppercase text-teal-50 hover:bg-teal-700"
                  href="/login"
                >
                  Sign in
                </a>
              </div>
            )}
          </div>
          {currentUser ? (
            <OfficeNavigation items={visibleNavItems(currentUser)} />
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}

function visibleNavItems(user: AuthUserResponse): OfficeNavItem[] {
  return navItems
    .filter((item) => {
      if (item.href === "/admin/users") {
        return canManageAccounts(user);
      }

      if (item.href === "/load-jobs") {
        return canManageOfficeLoadJobs(user);
      }

      if (item.href === "/work-hours") {
        return canReviewWorkHours(user);
      }

      if (item.href === "/unloading-wage") {
        return canReviewUnloadingWage(user);
      }

      return (
        item.requiredPermissions === undefined ||
        item.requiredPermissions.some((permission) =>
          hasPermission(user, permission),
        )
      );
    })
    .map(({ href, label }) => ({ href, label }));
}
