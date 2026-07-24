export const AUTH_TOKEN_COOKIE_NAME = "bestar_auth_token";
export const BROWSER_ACCESS_COOKIE_NAME = "bestar_access";
export const BROWSER_REFRESH_COOKIE_NAME = "bestar_refresh";
export const BROWSER_CSRF_COOKIE_NAME = "bestar_csrf";
export const BROWSER_SESSION_HINT_COOKIE_NAME = "bestar_session";
export const AUTH_REDIRECT_PARAM = "next";

export function getBrowserCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  return readCookie(document.cookie, BROWSER_CSRF_COOKIE_NAME);
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
  if (!encodedPayload) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;
    return payload !== null &&
      typeof payload === "object" &&
      typeof (payload as { exp?: unknown }).exp === "number"
      ? (payload as { exp: number }).exp
      : null;
  } catch {
    return null;
  }
}

export function readCookie(cookieHeader: string, name: string): string | null {
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return null;
      }
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
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/api/") || value === "/api") return "/";
  return value;
}
