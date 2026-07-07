import { NextResponse, type NextRequest } from "next/server";
import { getApiBaseUrl } from "@/lib/api-client";
import { AUTH_TOKEN_COOKIE_NAME } from "@/lib/auth-token";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ fileId: string }>;
  },
) {
  const token = request.cookies.get(AUTH_TOKEN_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      {
        code: "UNAUTHENTICATED",
        message: "Sign in before downloading generated summary files.",
        details: {},
      },
      { status: 401 },
    );
  }

  const { fileId } = await params;
  const upstream = await fetch(
    `${getApiBaseUrl()}/unloading-summary/exports/${encodeURIComponent(fileId)}/download`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return new Response(upstream.body, {
    headers: copyDownloadHeaders(upstream.headers),
    status: upstream.status,
    statusText: upstream.statusText,
  });
}

function copyDownloadHeaders(headers: Headers): Headers {
  const copied = new Headers();
  for (const key of [
    "content-disposition",
    "content-length",
    "content-type",
  ]) {
    const value = headers.get(key);
    if (value) {
      copied.set(key, value);
    }
  }
  return copied;
}
