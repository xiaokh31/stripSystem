import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_REDIRECT_PARAM,
  AUTH_TOKEN_COOKIE_NAME,
  isBrowserAuthTokenExpired,
} from "@/lib/auth-token";

const PUBLIC_PATH_PREFIXES = ["/api", "/_next", "/favicon.ico", "/login"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_TOKEN_COOKIE_NAME)?.value;
  if (token && !isBrowserAuthTokenExpired(token)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set(AUTH_REDIRECT_PARAM, `${pathname}${search}`);
  const response = NextResponse.redirect(loginUrl);
  if (token) {
    response.cookies.set(AUTH_TOKEN_COOKIE_NAME, "", {
      maxAge: 0,
      path: "/",
      sameSite: "lax",
    });
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
