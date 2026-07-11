export const AUTH_TOKEN_COOKIE_NAME = "bestar_auth_token";
export const AUTH_REDIRECT_PARAM = "next";

export function getBrowserAuthToken(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  return readCookie(document.cookie, AUTH_TOKEN_COOKIE_NAME);
}

export function setBrowserAuthToken(token: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") {
    return;
  }

  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = [
    `${AUTH_TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    "SameSite=Lax",
    secure,
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearBrowserAuthToken(): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${AUTH_TOKEN_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function isBrowserAuthTokenExpired(
  token: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const expiry = getAuthTokenExpiryEpochSeconds(token);
  return expiry === null || expiry <= nowEpochSeconds;
}

export function getAuthTokenExpiryEpochSeconds(token: string): number | null {
  const encodedPayload = token.split(".")[1];
  if (!encodedPayload) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;
    if (
      payload !== null &&
      typeof payload === "object" &&
      typeof (payload as { exp?: unknown }).exp === "number"
    ) {
      return (payload as { exp: number }).exp;
    }
  } catch {
    return null;
  }

  return null;
}

export function readCookie(cookieHeader: string, name: string): string | null {
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return globalThis.atob(padded);
}

export function safeAuthRedirectTarget(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  if (value.startsWith("/api/") || value === "/api") {
    return "/";
  }
  return value;
}
