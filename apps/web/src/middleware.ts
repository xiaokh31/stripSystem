import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_REDIRECT_PARAM,
  AUTH_TOKEN_COOKIE_NAME,
  BROWSER_ACCESS_COOKIE_NAME,
  BROWSER_SESSION_HINT_COOKIE_NAME,
  isBrowserAuthTokenExpired,
} from "@/lib/auth-token";

const PUBLIC_PATH_PREFIXES = [
  "/api",
  "/_next",
  "/favicon.ico",
  "/login",
  "/session/refresh",
];

export function middleware(request: NextRequest) {
  const security = securityPolicy();
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return secureNextResponse(request, security);
  }

  const token = request.cookies.get(BROWSER_ACCESS_COOKIE_NAME)?.value;
  if (token && !isBrowserAuthTokenExpired(token)) {
    return secureNextResponse(request, security);
  }

  const sessionHint = request.cookies.get(BROWSER_SESSION_HINT_COOKIE_NAME)?.value;
  if (sessionHint === "active") {
    const refreshUrl = request.nextUrl.clone();
    refreshUrl.pathname = "/session/refresh";
    refreshUrl.search = "";
    refreshUrl.searchParams.set(AUTH_REDIRECT_PARAM, `${pathname}${search}`);
    return applySecurityHeaders(NextResponse.redirect(refreshUrl), security);
  }

  const legacyToken = request.cookies.get(AUTH_TOKEN_COOKIE_NAME)?.value;
  if (
    legacyToken &&
    process.env.PUBLIC_DEPLOYMENT_ENABLED !== "true" &&
    !isBrowserAuthTokenExpired(legacyToken)
  ) {
    return secureNextResponse(request, security);
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set(AUTH_REDIRECT_PARAM, `${pathname}${search}`);
  const response = applySecurityHeaders(
    NextResponse.redirect(loginUrl),
    security,
  );
  if (token || legacyToken || sessionHint) {
    for (const cookieName of [
      BROWSER_ACCESS_COOKIE_NAME,
      BROWSER_SESSION_HINT_COOKIE_NAME,
      AUTH_TOKEN_COOKIE_NAME,
    ]) {
      response.cookies.set(cookieName, "", {
        maxAge: 0,
        path: "/",
        sameSite: "lax",
      });
    }
  }
  return response;
}

interface SecurityPolicy {
  csp: string;
  nonce: string;
}

function securityPolicy(): SecurityPolicy {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  return {
    nonce,
    csp: [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  };
}

function secureNextResponse(
  request: NextRequest,
  security: SecurityPolicy,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", security.csp);
  requestHeaders.set("x-nonce", security.nonce);
  return applySecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    security,
  );
}

function applySecurityHeaders(
  response: NextResponse,
  security: SecurityPolicy,
): NextResponse {
  response.headers.set("Content-Security-Policy", security.csp);
  response.headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=()",
  );
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  if (process.env.PUBLIC_DEPLOYMENT_ENABLED === "true") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return response;
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
