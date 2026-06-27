import Link from "next/link";
import { ManualContainerForm } from "@/components/containers/manual-container-form";

export const dynamic = "force-dynamic";

export default async function NewContainerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sourceImportId = firstQueryValue(params.fromImport);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Manual unloading report
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Create manual container
            </h1>
            {sourceImportId ? (
              <p className="mt-3 break-all text-sm text-zinc-600">
                Source import:{" "}
                <Link
                  className="font-semibold text-teal-700 underline hover:text-teal-900"
                  href={`/imports/${sourceImportId}`}
                >
                  {sourceImportId}
                </Link>
              </p>
            ) : null}
          </div>
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            href="/containers"
          >
            Containers
          </Link>
        </div>
      </section>

      <ManualContainerForm sourceImportId={sourceImportId} />
    </main>
  );
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
