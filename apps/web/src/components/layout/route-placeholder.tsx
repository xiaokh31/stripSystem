import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { createTranslator } from "@/lib/i18n/translator";

export function RoutePlaceholder({
  description,
  eyebrow,
  locale,
  title,
}: {
  description: MessageKey;
  eyebrow: MessageKey;
  locale: Locale;
  title: MessageKey;
}) {
  const { t } = createTranslator(locale);

  return (
    <main className="office-main-content flex flex-1 flex-col py-6">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">
          {t(eyebrow)}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          {t(title)}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          {t(description)}
        </p>
      </section>
    </main>
  );
}
