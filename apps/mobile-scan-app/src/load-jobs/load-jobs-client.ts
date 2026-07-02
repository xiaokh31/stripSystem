import { toNativeApiError } from "../api/api-error";
import { normalizeApiBaseUrl } from "../config/api-base-url";
import type {
  CloseLoadJobRequest,
  LoadJob,
  LoadJobListResponse,
  LoadJobScanResponse,
  ScanPalletRequest,
  UpdateLoadJobRequest,
} from "./load-job-types";

export interface LoadJobsClientOptions {
  fetcher?: typeof fetch;
  limit?: number;
}

const openLoadJobStatuses = ["PLANNED", "IN_PROGRESS"] as const;

export async function listOpenLoadJobs(
  apiBaseUrl: string,
  token: string,
  options: LoadJobsClientOptions = {},
): Promise<LoadJobListResponse> {
  const limit = options.limit ?? 50;
  const responses = await Promise.all(
    openLoadJobStatuses.map((status) =>
      listLoadJobs(apiBaseUrl, token, { ...options, limit, status }),
    ),
  );
  const itemsById = new Map<string, LoadJob>();
  for (const response of responses) {
    for (const item of response.items) {
      itemsById.set(item.id, item);
    }
  }

  const items = [...itemsById.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  return {
    items,
    limit,
    offset: 0,
  };
}

export async function getLoadJob(
  apiBaseUrl: string,
  token: string,
  id: string,
  options: LoadJobsClientOptions = {},
): Promise<LoadJob> {
  const response = await request(apiBaseUrl, `/load-jobs/${encodeURIComponent(id)}`, {
    fetcher: options.fetcher,
    method: "GET",
    token,
  });
  return (await response.json()) as LoadJob;
}

export async function updateLoadJob(
  apiBaseUrl: string,
  token: string,
  id: string,
  body: UpdateLoadJobRequest,
  options: LoadJobsClientOptions = {},
): Promise<LoadJob> {
  const response = await request(apiBaseUrl, `/load-jobs/${encodeURIComponent(id)}`, {
    body: JSON.stringify(body),
    fetcher: options.fetcher,
    headers: {
      "content-type": "application/json",
    },
    method: "PATCH",
    token,
  });
  return (await response.json()) as LoadJob;
}

export async function scanLoadJobPallet(
  apiBaseUrl: string,
  token: string,
  loadJobId: string,
  body: ScanPalletRequest,
  options: LoadJobsClientOptions = {},
): Promise<LoadJobScanResponse> {
  const response = await request(
    apiBaseUrl,
    `/load-jobs/${encodeURIComponent(loadJobId)}/scan`,
    {
      body: JSON.stringify(body),
      fetcher: options.fetcher,
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
      token,
    },
  );
  return (await response.json()) as LoadJobScanResponse;
}

export async function closeLoadJob(
  apiBaseUrl: string,
  token: string,
  id: string,
  body: CloseLoadJobRequest,
  options: LoadJobsClientOptions = {},
): Promise<LoadJob> {
  const response = await request(
    apiBaseUrl,
    `/load-jobs/${encodeURIComponent(id)}/close`,
    {
      body: JSON.stringify(body),
      fetcher: options.fetcher,
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
      token,
    },
  );
  return (await response.json()) as LoadJob;
}

async function listLoadJobs(
  apiBaseUrl: string,
  token: string,
  options: LoadJobsClientOptions & { status: string },
): Promise<LoadJobListResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 50));
  params.set("status", options.status);

  const response = await request(apiBaseUrl, `/load-jobs?${params.toString()}`, {
    fetcher: options.fetcher,
    method: "GET",
    token,
  });
  return (await response.json()) as LoadJobListResponse;
}

async function request(
  apiBaseUrl: string,
  path: string,
  options: RequestInit & LoadJobsClientOptions & { token: string },
): Promise<Response> {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);
  if (!normalized.ok) {
    throw new Error(normalized.message);
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${normalized.value}${path}`, {
    body: options.body,
    headers: {
      ...(options.headers ?? {}),
      authorization: `Bearer ${options.token}`,
    },
    method: options.method,
  });
  if (!response.ok) {
    throw await toNativeApiError(response);
  }

  return response;
}
