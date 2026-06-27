import Link from "next/link";

export default function ContainersPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Office
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Containers
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              Open a container from import parsing, or create a manual unloading
              report when office staff need to work from a paper or unsupported
              customer workbook.
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            href="/containers/new"
          >
            Create manual unloading report
          </Link>
        </div>
      </section>
    </main>
  );
}
