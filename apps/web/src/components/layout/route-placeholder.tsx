export function RoutePlaceholder({
  title,
  eyebrow,
  description,
}: {
  title: string;
  eyebrow: string;
  description: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          {description}
        </p>
      </section>
    </main>
  );
}
