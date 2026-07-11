"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  login,
  type LoginResponse,
} from "@/lib/api-client";
import {
  safeAuthRedirectTarget,
  setBrowserAuthToken,
} from "@/lib/auth-token";
import { translateMessage } from "@/lib/i18n/translator";
import { useClientHydrated } from "@/lib/use-client-hydrated";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const { locale } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<LoginError | null>(null);
  const isHydrated = useClientHydrated();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const localizedError = error ? localizeLoginError(error, locale) : null;

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

      {error && localizedError ? (
        <div
          className="border border-red-200 bg-red-50 p-3 text-sm text-red-950"
          role="alert"
        >
          <p className="font-semibold">{localizedError.title}</p>
          <p className="mt-1">{localizedError.message}</p>
          <p className="mt-2 text-xs text-red-800">
            <span>Code</span>:{" "}
            <span data-i18n-ignore="true">
              {error.code}
              {error.status ? ` (${error.status})` : ""}
            </span>
          </p>
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
  status: number;
}

function toLoginError(error: unknown): LoginError {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      status: error.status,
    };
  }

  return {
    code: "LOGIN_FAILED",
    status: 0,
  };
}

interface LocalizedLoginError {
  title: string;
  message: string;
}

const LOGIN_ERROR_MESSAGES: Record<string, LocalizedLoginError> = {
  FORBIDDEN: {
    title: "Sign-in failed",
    message: "The signed-in user does not have permission for this page.",
  },
  INVALID_CREDENTIALS: {
    title: "Sign-in failed",
    message: "Email or password is incorrect.",
  },
  JWT_SECRET_REQUIRED: {
    title: "Authentication service unavailable",
    message: "Authentication service is not configured. Contact an administrator.",
  },
  LOGIN_FAILED: {
    title: "Sign-in failed",
    message: "Login failed. Try again or contact an administrator.",
  },
  SYSTEM_USER_LOGIN_NOT_ALLOWED: {
    title: "Sign-in failed",
    message: "This account cannot sign in through the browser.",
  },
  UNAUTHENTICATED: {
    title: "Session expired",
    message: "Your session expired. Sign in again to continue.",
  },
  USER_INACTIVE: {
    title: "Sign-in failed",
    message: "This account is inactive. Ask an administrator to reactivate it.",
  },
};

function localizeLoginError(
  error: LoginError,
  locale: Parameters<typeof translateMessage>[1],
): LocalizedLoginError {
  const message =
    LOGIN_ERROR_MESSAGES[error.code] ?? LOGIN_ERROR_MESSAGES.LOGIN_FAILED;

  return {
    title: translateMessage(message.title, locale) ?? message.title,
    message: translateMessage(message.message, locale) ?? message.message,
  };
}
