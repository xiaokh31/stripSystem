import Link from "next/link";
import { ParserProfileGovernance } from "@/components/parser-profiles/parser-profile-governance";
import { getParserProfileVersion } from "@/lib/api-client";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import {
  canApproveParserProfiles,
  canReadParserProfiles,
  canTrainParserProfiles,
} from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function ParserProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [locale, currentUser, apiOptions] = await Promise.all([
    getServerLocale(),
    getServerCurrentUser(),
    getServerApiOptions(),
  ]);
  const { t } = createTranslator(locale);
  if (!canReadParserProfiles(currentUser)) {
    return <main className="px-4 py-8 sm:px-6 lg:px-8" data-parser-profile-workspace="true"><p className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">{t("i18n.parserProfiles.permissionDenied")}</p></main>;
  }
  const profile = await getParserProfileVersion(id, apiOptions);
  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8" data-parser-profile-workspace="true">
      <Link className="text-sm font-semibold underline underline-offset-4" href="/parser-profiles">← {t("i18n.parserProfiles.back")}</Link>
      <header className="mt-5 border-b border-[var(--line-soft)] pb-5">
        <h1 className="font-control text-2xl font-semibold">{t("i18n.parserProfiles.detail")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">{t("i18n.parserProfiles.subtitle")}</p>
      </header>
      <ParserProfileGovernance
        canApprove={canApproveParserProfiles(currentUser)}
        canTrain={canTrainParserProfiles(currentUser)}
        initialProfile={profile}
      />
    </main>
  );
}
