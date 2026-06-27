import { ImportUploadForm } from "@/components/imports/import-upload-form";

export default function NewImportPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">
          New import
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          Upload unloading Excel files
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
          Select one or more real .xlsx unloading files. Uploads are sent to the
          API and duplicate SHA-256 responses are shown per file.
        </p>
      </section>
      <ImportUploadForm />
    </main>
  );
}
