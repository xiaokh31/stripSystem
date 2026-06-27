import Link from "next/link";

export default async function ImportDetailPlaceholderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">
          Import detail
        </p>
        <h1 className="mt-2 break-all text-2xl font-semibold text-zinc-950">
          {id}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          Import detail and parse actions are not implemented in P2-02.
        </p>
        <Link
          className="mt-5 inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
          href="/imports/new"
        >
          Upload another file
        </Link>
      </section>
    </main>
  );
}
