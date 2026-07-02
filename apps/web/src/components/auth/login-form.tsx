"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiClientError,
  login,
  type LoginResponse,
} from "@/lib/api-client";
import {
  safeAuthRedirectTarget,
  setBrowserAuthToken,
} from "@/lib/auth-token";
import { useClientHydrated } from "@/lib/use-client-hydrated";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<LoginError | null>(null);
  const isHydrated = useClientHydrated();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");

    try {
      const result: LoginResponse = await login({ email, password });
      setBrowserAuthToken(result.accessToken, result.expiresIn);
      router.replace(safeAuthRedirectTarget(nextPath));
      router.refresh();
    } catch (caught) {
      setError(toLoginError(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-medium text-zinc-700">
        Email
        <input
          autoComplete="email"
          className="min-h-11 border border-zinc-300 bg-white px-3 text-base text-zinc-950 outline-none focus:border-teal-700"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-zinc-700">
        Password
        <input
          autoComplete="current-password"
          className="min-h-11 border border-zinc-300 bg-white px-3 text-base text-zinc-950 outline-none focus:border-teal-700"
          name="password"
          required
          type="password"
        />
      </label>

      {error ? (
        <div
          className="border border-red-200 bg-red-50 p-3 text-sm text-red-950"
          role="alert"
        >
          <p className="font-semibold">
            {error.code}
            {error.status ? ` (${error.status})` : ""}
          </p>
          <p className="mt-1">{error.message}</p>
        </div>
      ) : null}

      <button
        className="min-h-11 border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 disabled:text-zinc-600"
        disabled={!isHydrated || isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}

interface LoginError {
  code: string;
  message: string;
  status: number;
}

function toLoginError(error: unknown): LoginError {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  return {
    code: "LOGIN_FAILED",
    message: error instanceof Error ? error.message : "Login failed.",
    status: 0,
  };
}
