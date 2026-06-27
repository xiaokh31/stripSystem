export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
  timestamp?: string;
  path?: string;
}

export interface ApiHealthResponse {
  status: "ok" | "degraded";
  version: string;
  database: {
    status: "up" | "down";
    message?: string;
  };
  timestamp: string;
}

export interface ApiClientOptions {
  baseUrl?: string;
  authToken?: string | null;
  fetcher?: typeof fetch;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  authToken?: string | null;
  body?: BodyInit | Record<string, unknown> | null;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly path?: string;
  readonly status: number;
  readonly timestamp?: string;

  constructor(input: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    path?: string;
    timestamp?: string;
  }) {
    super(input.message);
    this.name = "ApiClientError";
    this.code = input.code;
    this.details = input.details ?? {};
    this.path = input.path;
    this.status = input.status;
    this.timestamp = input.timestamp;
  }
}

const DEFAULT_API_BASE_URL = "http://localhost:3000/api";

export function getApiBaseUrl(): string {
  return normalizeBaseUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.API_BASE_URL ??
      DEFAULT_API_BASE_URL,
  );
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  return new ApiClient(options);
}

export async function getApiHealth(): Promise<ApiHealthResponse> {
  return createApiClient().get<ApiHealthResponse>("/health");
}

export class ApiClient {
  private readonly authToken: string | null;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.authToken = options.authToken ?? null;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? getApiBaseUrl());
    this.fetcher = options.fetcher ?? fetch;
  }

  get<TResponse>(
    path: string,
    options: Omit<ApiRequestOptions, "method" | "body"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, { ...options, method: "GET" });
  }

  post<TResponse>(
    path: string,
    body?: ApiRequestOptions["body"],
    options: Omit<ApiRequestOptions, "method" | "body"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, { ...options, method: "POST", body });
  }

  patch<TResponse>(
    path: string,
    body?: ApiRequestOptions["body"],
    options: Omit<ApiRequestOptions, "method" | "body"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, {
      ...options,
      method: "PATCH",
      body,
    });
  }

  async request<TResponse>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    const headers = new Headers(options.headers);
    const authToken = options.authToken ?? this.authToken;
    const body = serializeBody(options.body, headers);

    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }

    let response: Response;
    try {
      response = await this.fetcher(this.urlFor(path), {
        ...options,
        body,
        cache: options.cache ?? "no-store",
        headers,
      });
    } catch (error) {
      throw new ApiClientError({
        code: "API_NETWORK_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "The API request could not be sent.",
        status: 0,
        details: { baseUrl: this.baseUrl, path },
      });
    }

    if (!response.ok) {
      throw await toApiClientError(response);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await parseResponseBody(response)) as TResponse;
  }

  private urlFor(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    if (this.baseUrl.startsWith("/")) {
      return `${this.baseUrl}${normalizedPath}`;
    }

    return new URL(normalizedPath.replace(/^\//, ""), `${this.baseUrl}/`)
      .toString();
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function serializeBody(
  body: ApiRequestOptions["body"],
  headers: Headers,
): BodyInit | null | undefined {
  if (body === null || body === undefined) {
    return body;
  }

  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams ||
    typeof body === "string"
  ) {
    return body;
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return JSON.stringify(body);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function toApiClientError(response: Response): Promise<ApiClientError> {
  const body = await parseErrorBody(response);
  return new ApiClientError({
    code: body.code,
    message: body.message,
    status: response.status,
    details: body.details,
    path: body.path,
    timestamp: body.timestamp,
  });
}

async function parseErrorBody(response: Response): Promise<ApiErrorResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const parsed = await response.json();
    if (isApiErrorResponse(parsed)) {
      return parsed;
    }
  }

  const text = await response.text();
  return {
    code: `HTTP_${response.status}`,
    message:
      response.statusText ||
      `API request failed with HTTP status ${response.status}.`,
    details: text ? { bodyPreview: text.slice(0, 500) } : {},
  };
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}
