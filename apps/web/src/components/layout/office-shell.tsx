import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { StatusPill } from "@/components/dashboard";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { InventorySyncRefreshListener } from "@/components/inventory/inventory-sync-refresh";
import { OperationalClock } from "@/components/layout/operational-clock";
import { ThemeControl } from "@/components/layout/theme-control";
import type { AuthUserResponse } from "@/lib/api-client";
import { OPERATIONAL_TIME_ZONE_LABEL } from "@/lib/date-time";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import type { ThemePreference } from "@/lib/theme";
import { healthStatusLabel, roleDisplayLabel } from "@/lib/i18n/status-labels";
import { createTranslator, type Translator } from "@/lib/i18n/translator";
import {
  ATTENDANCE_READ_PERMISSION,
  INVENTORY_READ_PERMISSION,
  UNLOADING_SUMMARY_READ_PERMISSION,
  UNLOADING_WAGE_READ_PERMISSION,
  canManageAccounts,
  canManageOfficeLoadJobs,
  hasPermission,
} from "@/lib/permissions";
import { OfficeNavigation, type OfficeNavItem } from "./office-navigation";

interface PermissionAwareNavItem {
  href: string;
  label: MessageKey;
  requiredPermissions?: string[];
}

export interface OfficeShellHealth {
  apiStatus: "degraded" | "down" | "ok";
  databaseStatus: "down" | "unknown" | "up";
  version?: string;
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
    href: "/inventory",
    label: "Inventory",
    requiredPermissions: [INVENTORY_READ_PERMISSION],
  },
  {
    href: "/load-jobs",
    label: "Load Jobs",
    requiredPermissions: ["load_jobs.create"],
  },
  {
    href: "/reports",
    label: "Reports",
    requiredPermissions: [
      INVENTORY_READ_PERMISSION,
      ATTENDANCE_READ_PERMISSION,
      UNLOADING_WAGE_READ_PERMISSION,
      UNLOADING_SUMMARY_READ_PERMISSION,
    ],
  },
  {
    href: "/work-hours",
    label: "Work Hours",
    requiredPermissions: [ATTENDANCE_READ_PERMISSION],
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
  health,
  locale,
  theme,
}: {
  children: ReactNode;
  currentUser: AuthUserResponse | null;
  health: OfficeShellHealth;
  locale: Locale;
  theme: ThemePreference;
}) {
  const { t } = createTranslator(locale);
  const visibleItems = currentUser ? visibleNavItems(currentUser, t) : [];

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {currentUser ? <InventorySyncRefreshListener /> : null}
      {currentUser ? (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-black/20 bg-[var(--dock-steel)] text-white lg:flex">
          <div className="border-b border-white/10 px-4 py-5">
            <p className="text-xs font-semibold text-zinc-300">
              {t("Bestar Service CCA")}
            </p>
            <p className="font-control mt-2 text-xl font-semibold">
              {t("Manifest Control Room")}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <OfficeNavigation items={visibleItems} variant="rail" />
          </div>
          <div className="border-t border-white/10 px-4 py-4 text-xs text-zinc-300">
            <p className="font-semibold uppercase">{t("Operational profile")}</p>
            <p className="mt-1 font-data" data-i18n-ignore="true">
              {OPERATIONAL_TIME_ZONE_LABEL}
            </p>
          </div>
        </aside>
      ) : null}

      <div
        className={currentUser ? "min-h-screen min-w-0 lg:pl-64" : "min-h-screen min-w-0"}
        data-office-shell-content="true"
      >
        <header className="sticky top-0 z-30 border-b border-[var(--line-soft)] bg-[var(--dock-steel)] text-white shadow-sm">
          <div className="flex w-full flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-300">
                  {t("Bestar Service CCA")}
                </p>
                <p className="font-control mt-1 text-lg font-semibold sm:hidden">
                  {t("Manifest Control Room")}
                </p>
                <p className="font-control mt-1 hidden text-lg font-semibold sm:block lg:hidden">
                  {t("Warehouse Office")}
                </p>
              </div>

              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                <OperationalStatus health={health} locale={locale} />
                <UserCluster currentUser={currentUser} locale={locale} />
                <ThemeControl initialTheme={theme} />
                <LanguageSwitcher />
                {currentUser ? (
                  <LogoutButton />
                ) : (
                  <a
                    className="inline-flex min-h-9 items-center border border-white/20 bg-white px-3 text-xs font-semibold uppercase text-[var(--surface-action-foreground)] hover:bg-zinc-100"
                    href="/login"
                  >
                    {t("Sign in")}
                  </a>
                )}
              </div>
            </div>
            {currentUser ? (
              <div className="border-t border-white/10 px-2 lg:hidden">
                <OfficeNavigation items={visibleItems} />
              </div>
            ) : null}
          </div>
      </header>
      {children}
      </div>
    </div>
  );
}

function OperationalStatus({
  health,
  locale,
}: {
  health: OfficeShellHealth;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);
  const apiTone = health.apiStatus === "ok" ? "success" : "warning";
  const databaseTone = health.databaseStatus === "up" ? "success" : "danger";
  const initialClockIso = new Date().toISOString();

  return (
    <div className="hidden flex-wrap items-center gap-2 xl:flex">
      <div className="border border-white/10 bg-white/5 px-3 py-2 text-xs">
        <p className="font-semibold text-zinc-300">
          {t("Operational time")}
        </p>
        <OperationalClock initialIso={initialClockIso} />
      </div>
      <div className="border border-white/10 bg-white/5 px-3 py-2 text-xs">
        <p className="font-semibold text-zinc-300">{t("Time zone")}</p>
        <p className="font-data mt-1" data-i18n-ignore="true">
          {OPERATIONAL_TIME_ZONE_LABEL}
        </p>
      </div>
      <StatusPill
        label={healthStatusLabel(health.apiStatus, locale)}
        title={t("API status")}
        tone={apiTone}
      />
      <StatusPill
        label={healthStatusLabel(health.databaseStatus, locale)}
        title={t("Database status")}
        tone={databaseTone}
      />
    </div>
  );
}

function UserCluster({
  currentUser,
  locale,
}: {
  currentUser: AuthUserResponse | null;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);
  if (!currentUser) {
    return (
      <div className="hidden border border-white/10 bg-white/5 px-3 py-2 text-xs sm:block">
        <p className="font-semibold text-zinc-300">{t("Current user")}</p>
        <p className="mt-1">{t("No active session")}</p>
      </div>
    );
  }

  const userName = currentUser.name ?? currentUser.email ?? currentUser.id;

  return (
    <div className="min-w-0 border border-white/10 bg-white/5 px-3 py-2 text-xs">
      <p className="font-semibold text-zinc-300">{t("Current user")}</p>
      <p
        className="mt-1 max-w-48 truncate font-semibold"
        data-i18n-ignore="true"
        title={userName}
      >
        {userName}
      </p>
      <div className="mt-2 flex max-w-72 flex-wrap gap-1">
        {currentUser.roles.map((role) => (
          <span
            className="border border-white/15 bg-black/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-zinc-100"
            key={role}
            title={roleDisplayLabel(role, locale)}
          >
            {roleDisplayLabel(role, locale)}
          </span>
        ))}
      </div>
    </div>
  );
}

function visibleNavItems(
  user: AuthUserResponse,
  t: Translator["t"],
): OfficeNavItem[] {
  return navItems
    .filter((item) => {
      if (item.href === "/admin/users") {
        return canManageAccounts(user);
      }

      if (item.href === "/load-jobs") {
        return canManageOfficeLoadJobs(user);
      }

      return (
        item.requiredPermissions === undefined ||
        item.requiredPermissions.some((permission) =>
          hasPermission(user, permission),
        )
      );
    })
    .map(({ href, label }) => ({ href, label: t(label) }));
}
