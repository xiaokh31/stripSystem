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

export function safeAuthRedirectTarget(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  if (value.startsWith("/api/") || value === "/api") {
    return "/";
  }
  return value;
}
