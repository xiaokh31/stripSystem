import { NextResponse, type NextRequest } from "next/server";
import { getApiBaseUrl } from "@/lib/api-client";
import { getRequestApiAuthHeaders } from "@/lib/server-auth";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ containerId: string; fileId: string }>;
  },
) {
  const authHeaders = getRequestApiAuthHeaders(request);
  if (!authHeaders) {
    return NextResponse.json(
      {
        code: "UNAUTHENTICATED",
        message: "Sign in before downloading generated files.",
        details: {},
      },
      { status: 401 },
    );
  }

  const { containerId, fileId } = await params;
  const upstream = await fetch(
    `${getApiBaseUrl()}/containers/${encodeURIComponent(containerId)}/files/${encodeURIComponent(fileId)}/download`,
    {
      cache: "no-store",
      headers: authHeaders,
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
