import { ImportUploadForm } from "@/components/imports/import-upload-form";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";

export default async function NewImportPage() {
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">
          {t("New import")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          {t("Upload unloading Excel files")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
          {t(
            "Select one or more real .xlsx unloading files. Uploads are sent to the API and duplicate SHA-256 responses are shown per file.",
          )}
        </p>
      </section>
      <ImportUploadForm />
    </main>
  );
}
