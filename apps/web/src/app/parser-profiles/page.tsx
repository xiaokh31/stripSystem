import Link from "next/link";
import { lifecycleKey, trustKey } from "@/components/parser-profiles/parser-profile-labels";
import { listParserProfiles } from "@/lib/api-client";
import { formatLocalizedOperationalDateTime } from "@/lib/date-time";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { canReadParserProfiles } from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function ParserProfilesPage() {
  const [locale, currentUser, apiOptions] = await Promise.all([
    getServerLocale(),
    getServerCurrentUser(),
    getServerApiOptions(),
  ]);
  const { t } = createTranslator(locale);
  if (!canReadParserProfiles(currentUser)) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8" data-parser-profile-workspace="true">
        <h1 className="font-control text-2xl font-semibold">{t("i18n.parserProfiles.title")}</h1>
        <p className="mt-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {t("i18n.parserProfiles.permissionDenied")}
        </p>
      </main>
    );
  }

  const profiles = await listParserProfiles(apiOptions);
  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8" data-parser-profile-workspace="true">
      <header className="border-b border-[var(--line-soft)] pb-5">
        <h1 className="font-control text-2xl font-semibold">{t("i18n.parserProfiles.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">{t("i18n.parserProfiles.subtitle")}</p>
      </header>

      {profiles.items.length === 0 ? (
        <p className="mt-8 border border-dashed border-[var(--line-soft)] px-4 py-8 text-sm text-[var(--muted)]">
          {t("i18n.parserProfiles.empty")}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto border border-[var(--line-soft)] bg-[var(--surface)]">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">{t("i18n.parserProfiles.title")}</th>
                <th className="px-4 py-3">{t("i18n.parserProfiles.version")}</th>
                <th className="px-4 py-3">{t("i18n.parserProfiles.lifecycle")}</th>
                <th className="px-4 py-3">{t("i18n.parserProfiles.trust")}</th>
                <th className="px-4 py-3">{t("i18n.parserProfiles.streak")}</th>
                <th className="px-4 py-3">{t("i18n.parserProfiles.lastReplay")}</th>
                <th className="px-4 py-3">{t("i18n.parserProfiles.updated")}</th>
                <th className="px-4 py-3">{t("i18n.parserProfiles.approvedBy")}</th>
                <th className="px-4 py-3"><span className="sr-only">{t("i18n.parserProfiles.open")}</span></th>
              </tr>
            </thead>
            <tbody>
              {profiles.items.map((profile) => (
                <tr className="border-t border-[var(--line-soft)] align-top" key={profile.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{profile.customerLabel || profile.stableName}</p>
                    {profile.customerLabel ? <p className="mt-1 font-data text-xs text-[var(--muted)]">{profile.stableName}</p> : null}
                  </td>
                  <td className="px-4 py-3 font-data">{profile.version}</td>
                  <td className="px-4 py-3"><StateChip>{t(lifecycleKey(profile.lifecycle))}</StateChip></td>
                  <td className="px-4 py-3"><StateChip>{t(trustKey(profile.trustState))}</StateChip></td>
                  <td className="px-4 py-3 font-data">{profile.trustStreak}/3</td>
                  <td className="px-4 py-3">
                    {profile.lastReplay ? t(profile.lastReplay.passed ? "i18n.parserProfiles.replayPassed" : "i18n.parserProfiles.replayFailed") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <p>{profile.updatedBy.name || profile.updatedBy.email || "—"}</p>
                    <p className="mt-1 whitespace-nowrap text-xs text-[var(--muted)]">{formatLocalizedOperationalDateTime(profile.updatedAt, locale)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{profile.approvedBy?.name || profile.approvedBy?.email || "—"}</p>
                    <p className="mt-1 whitespace-nowrap text-xs text-[var(--muted)]">{profile.approvedAt ? formatLocalizedOperationalDateTime(profile.approvedAt, locale) : "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link className="inline-flex min-h-10 items-center border border-[var(--line-strong)] px-3 font-semibold hover:bg-[var(--surface-muted)]" href={`/parser-profiles/${encodeURIComponent(profile.id)}`}>
                      {t("i18n.parserProfiles.open")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function StateChip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex min-h-7 items-center border border-[var(--line-soft)] bg-[var(--surface-muted)] px-2 text-xs font-semibold">{children}</span>;
}
