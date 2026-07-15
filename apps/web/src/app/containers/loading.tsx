import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";

export default async function ContainersLoading() {
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);
  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6" aria-busy="true" aria-live="polite">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">{t("Office")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{t("Containers")}</h1>
        <p className="mt-4 text-sm text-zinc-600">{t("Loading container index")}</p>
      </section>
    </main>
  );
}
