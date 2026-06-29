import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { AUTH_REDIRECT_PARAM } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextValue = params[AUTH_REDIRECT_PARAM];
  const nextPath = Array.isArray(nextValue) ? nextValue[0] : nextValue;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 items-start px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid w-full max-w-md gap-5 border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm font-semibold uppercase text-teal-700">
            Authentication
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            Sign in
          </h1>
        </div>

        <LoginForm nextPath={nextPath} />

        <div className="border-t border-zinc-100 pt-4 text-sm text-zinc-600">
          <Link
            className="font-semibold text-teal-700 underline hover:text-teal-900"
            href="/api/health"
          >
            Check API health
          </Link>
        </div>
      </section>
    </main>
  );
}
