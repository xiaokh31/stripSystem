import Link from "next/link";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "../../lib/i18n/catalog";
import { createTranslator } from "../../lib/i18n/translator";

export type DashboardTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export function DashboardPanel({
  actions,
  children,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <section className="dashboard-panel min-w-0 border border-[var(--line-soft)] bg-[var(--panel-surface)] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line-soft)] px-4 py-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold text-[var(--seal-teal)]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="font-control mt-1 text-lg font-semibold text-[var(--ink)]">
            {title}
          </h2>
        </div>
        {actions ? <div className="flex min-w-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function MetricTile({
  detail,
  href,
  label,
  tone = "neutral",
  value,
}: {
  detail?: string;
  href?: string;
  label: string;
  tone?: DashboardTone;
  value: number | string;
}) {
  const content = (
    <>
      <p className="text-xs font-semibold text-zinc-500">{label}</p>
      <p className="font-control mt-2 text-3xl font-semibold leading-tight text-[var(--ink)]">
        {value}
      </p>
      {detail ? <p className="mt-2 text-sm text-zinc-600">{detail}</p> : null}
    </>
  );
  const className = [
    "metric-tile block min-h-28 min-w-0 border-l-4 bg-[var(--panel-muted)] p-4 transition-colors",
    toneBorderClass(tone),
    href ? "hover:bg-white" : "",
  ].join(" ");

  if (href) {
    return (
      <Link className={className} data-tone={tone} href={href}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} data-tone={tone}>
      {content}
    </div>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
  title,
}: {
  label: string;
  tone?: DashboardTone;
  title?: string;
}) {
  return (
    <span
      className={[
        "status-pill inline-flex min-h-7 max-w-full items-center gap-1 border px-2.5 text-xs font-semibold leading-5 whitespace-normal",
        tonePillClass(tone),
      ].join(" ")}
      data-tone={tone}
      title={title}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 bg-current" />
      {label}
    </span>
  );
}

export function ProgressBar({
  label,
  max,
  tone = "info",
  value,
}: {
  label: string;
  max: number;
  tone?: DashboardTone;
  value: number;
}) {
  const safeMax = Math.max(0, max);
  const safeValue = Math.min(Math.max(0, value), safeMax);
  const percent = safeMax > 0 ? (safeValue / safeMax) * 100 : 0;

  return (
    <div className="progress-bar">
      <div className="mb-1 flex items-start justify-between gap-3 text-xs font-medium text-zinc-600">
        <span className="min-w-0">{label}</span>
        <span className="font-data" data-i18n-ignore="true">
          {safeValue}/{safeMax}
        </span>
      </div>
      <div
        aria-label={label}
        aria-valuemax={safeMax}
        aria-valuemin={0}
        aria-valuenow={safeValue}
        className="h-2 border border-[var(--line-soft)] bg-white"
        role="progressbar"
      >
        <div
          className={["h-full", toneFillClass(tone)].join(" ")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export interface DockLane {
  code: string;
  dockNo: string;
  href?: string;
  loadedPallets: number;
  remainingPallets: number;
  statusLabel: string;
  tone?: DashboardTone;
  totalPallets: number;
  truckNo: string;
}

export function DockLaneStrip({
  ariaLabel,
  lanes,
  locale = DEFAULT_LOCALE,
}: {
  ariaLabel?: string;
  lanes: DockLane[];
  locale?: Locale;
}) {
  const { t } = createTranslator(locale);

  return (
    <div
      aria-label={ariaLabel ?? t("Dock lane strip")}
      className="dock-lane-strip overflow-x-auto border border-[var(--line-soft)] bg-[var(--panel-surface)]"
    >
      <div className="grid min-w-[720px] auto-cols-fr grid-flow-col">
        {lanes.map((lane) => {
          const laneContent = (
            <div className="flex h-full min-h-32 flex-col gap-3 border-r border-[var(--line-soft)] p-3 last:border-r-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-500">
                    {t("Dock")}
                  </p>
                  <p
                    className="font-data mt-1 text-lg font-semibold text-[var(--ink)]"
                    data-i18n-ignore="true"
                  >
                    {lane.dockNo}
                  </p>
                </div>
                <StatusPill
                  label={lane.statusLabel}
                  tone={lane.tone ?? "neutral"}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                <div>
                  <p className="font-semibold text-zinc-500">{t("Truck")}</p>
                  <p className="font-data mt-1" data-i18n-ignore="true">
                    {lane.truckNo}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-500">
                    {t("Remaining")}
                  </p>
                  <p className="font-data mt-1" data-i18n-ignore="true">
                    {lane.remainingPallets}
                  </p>
                </div>
              </div>
              <ProgressBar
                label={t("Loaded")}
                max={lane.totalPallets}
                tone={lane.tone ?? "info"}
                value={lane.loadedPallets}
              />
            </div>
          );

          return lane.href ? (
            <Link
              className="block focus-visible:z-10"
              href={lane.href}
              key={lane.code}
            >
              {laneContent}
            </Link>
          ) : (
            <div key={lane.code}>{laneContent}</div>
          );
        })}
      </div>
    </div>
  );
}

export interface LifecycleLane {
  code: string;
  count: number;
  href: string;
  label: string;
  tone?: DashboardTone;
}

export function LifecycleDockStrip({
  ariaLabel,
  lanes,
  locale = DEFAULT_LOCALE,
  total,
}: {
  ariaLabel?: string;
  lanes: LifecycleLane[];
  locale?: Locale;
  total: number;
}) {
  const { t } = createTranslator(locale);
  const safeTotal = Math.max(0, total);

  return (
    <div
      aria-label={ariaLabel ?? t("Dock lane strip")}
      className="lifecycle-dock-strip overflow-x-auto border border-[var(--line-soft)] bg-[var(--panel-surface)]"
    >
      <div className="grid min-w-[980px] grid-flow-col auto-cols-fr">
        {lanes.map((lane, index) => {
          const percent = safeTotal > 0 ? (lane.count / safeTotal) * 100 : 0;

          return (
            <Link
              className="group relative grid min-h-40 h-full grid-rows-[minmax(4.5rem,1fr)_0.75rem_1rem] gap-3 border-r border-[var(--line-soft)] p-3 transition-colors last:border-r-0 hover:bg-[var(--panel-muted)]"
              href={lane.href}
              key={lane.code}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-data text-xs font-semibold text-zinc-500">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-5 text-[var(--ink)]">
                    {lane.label}
                  </p>
                </div>
                <StatusPill
                  label={String(lane.count)}
                  tone={lane.tone ?? "neutral"}
                />
              </div>
              <div className="h-3 self-end border border-[var(--line-soft)] bg-white">
                <div
                  className={[
                    "h-full transition-[width] group-hover:brightness-95",
                    toneFillClass(lane.tone ?? "neutral"),
                  ].join(" ")}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="font-data text-xs leading-4 text-zinc-500">
                {lane.count}/{safeTotal}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function PressureBar({
  segments,
}: {
  segments: Array<{
    label: string;
    tone?: DashboardTone;
    value: number;
  }>;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className="pressure-bar">
      <div className="flex h-3 overflow-hidden border border-[var(--line-soft)] bg-white">
        {segments.map((segment) => (
          <div
            aria-label={segment.label}
            className={toneFillClass(segment.tone ?? "neutral")}
            key={segment.label}
            style={{
              width: `${total > 0 ? (segment.value / total) * 100 : 0}%`,
            }}
            title={segment.label}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
        {segments.map((segment) => (
          <span className="inline-flex items-center gap-1" key={segment.label}>
            <span
              aria-hidden="true"
              className={["h-2 w-2", toneFillClass(segment.tone ?? "neutral")].join(
                " ",
              )}
            />
            {segment.label}
            <span className="font-data" data-i18n-ignore="true">
              {segment.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ExceptionList({
  emptyLabel,
  items,
  locale = DEFAULT_LOCALE,
}: {
  emptyLabel?: string;
  items: Array<{
    count: number;
    href?: string;
    label: string;
    tone?: Exclude<DashboardTone, "success">;
  }>;
  locale?: Locale;
}) {
  const { t } = createTranslator(locale);

  if (items.length === 0) {
    return (
      <p className="border border-dashed border-[var(--line-soft)] bg-[var(--panel-muted)] p-3 text-sm text-zinc-600">
        {emptyLabel ?? t("No issues")}
      </p>
    );
  }

  return (
    <ul className="exception-list divide-y divide-[var(--line-soft)] border border-[var(--line-soft)]">
      {items.map((item) => {
        const content = (
          <>
            <span>{item.label}</span>
            <StatusPill
              label={String(item.count)}
              tone={item.tone === "danger" ? "danger" : "warning"}
            />
          </>
        );

        return (
          <li key={item.label}>
            {item.href ? (
              <Link
                className="flex min-h-12 items-center justify-between gap-4 px-3 py-2 text-sm font-medium hover:bg-[var(--panel-muted)]"
                href={item.href}
              >
                {content}
              </Link>
            ) : (
              <div className="flex min-h-12 items-center justify-between gap-4 px-3 py-2 text-sm font-medium">
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function toneBorderClass(tone: DashboardTone): string {
  return {
    danger: "border-[var(--exception-red)]",
    info: "border-[var(--dock-steel-muted)]",
    neutral: "border-[var(--line-strong)]",
    success: "border-[var(--seal-teal)]",
    warning: "border-[var(--forklift-amber)]",
  }[tone];
}

function toneFillClass(tone: DashboardTone): string {
  return {
    danger: "bg-[var(--exception-red)]",
    info: "bg-[var(--dock-steel-muted)]",
    neutral: "bg-[var(--line-strong)]",
    success: "bg-[var(--seal-teal)]",
    warning: "bg-[var(--forklift-amber)]",
  }[tone];
}

function tonePillClass(tone: DashboardTone): string {
  return {
    danger: "border-red-200 bg-red-50 text-red-800",
    info: "border-[var(--info-border)] bg-[var(--info-surface)] text-[var(--info-text)]",
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];
}
