"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm">
        <p className="text-sm font-semibold uppercase">Page error</p>
        <h1 className="mt-2 text-xl font-semibold">The page failed to load.</h1>
        <p className="mt-3 break-words text-sm">{error.message}</p>
        {error.digest ? (
          <p className="mt-2 text-xs text-red-800">Digest: {error.digest}</p>
        ) : null}
        <button
          className="mt-5 min-h-10 border border-red-300 bg-white px-4 text-sm font-semibold text-red-950 hover:bg-red-100"
          type="button"
          onClick={reset}
        >
          Retry
        </button>
      </section>
    </main>
  );
}
