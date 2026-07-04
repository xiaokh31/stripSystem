import { NextResponse, type NextRequest } from "next/server";
import { getApiBaseUrl } from "@/lib/api-client";
import { AUTH_TOKEN_COOKIE_NAME } from "@/lib/auth-token";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ fileId: string; id: string }>;
  },
) {
  const token = request.cookies.get(AUTH_TOKEN_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      {
        code: "UNAUTHENTICATED",
        message: "Sign in before downloading generated wage files.",
        details: {},
      },
      { status: 401 },
    );
  }

  const { fileId, id } = await params;
  const upstream = await fetch(
    `${getApiBaseUrl()}/attendance-imports/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/download`,
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
