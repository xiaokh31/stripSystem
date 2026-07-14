import Link from "next/link";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";

export default async function NotFound() {
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);

  return (
    <main className="office-main-content flex flex-1 flex-col py-6">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">
          {t("Page not found")}
        </p>
        <h1 className="mt-2 text-xl font-semibold text-zinc-950">
          {t("The requested page does not exist or is no longer available.")}
        </h1>
        <Link
          className="mt-5 inline-flex min-h-10 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          href="/"
        >
          {t("Go to dashboard")}
        </Link>
      </section>
    </main>
  );
}
