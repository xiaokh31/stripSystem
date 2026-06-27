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

export interface ImportFileResponse {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  mimeType: string | null;
  fileSizeBytes: string | null;
  format: string;
  importStatus: string;
  parseStatus: string;
  parserVersion: string | null;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContainerLineResponse {
  id: string;
  lineNo: number;
  destinationCode: string | null;
  destinationType: string | null;
  cartons: number | null;
  volume: string | null;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
}

export interface ContainerDestinationResponse {
  id: string;
  destinationCode: string;
  destinationType: string | null;
  cartons: number;
  volume: string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  note: string | null;
  warnings: unknown;
  errors: unknown;
}

export interface ContainerResponse {
  id: string;
  importFileId: string;
  containerNo: string;
  sourceFormat: string;
  parserVersion: string | null;
  status: string;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
  lines: ContainerLineResponse[];
  destinations: ContainerDestinationResponse[];
}

export interface ImportParseResultResponse {
  importFile: ImportFileResponse;
  containers: ContainerResponse[];
  warnings: unknown[];
  errors: unknown[];
}

export interface ApiClientOptions {
  baseUrl?: string;
  authToken?: string | null;
  fetcher?: typeof fetch;
}

export interface UploadProgress {
  loaded: number;
  percent: number | null;
  total: number | null;
}

export interface UploadImportFileOptions {
  authToken?: string | null;
  baseUrl?: string;
  onProgress?: (progress: UploadProgress) => void;
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

export function getImportFile(
  id: string,
  options: ApiClientOptions = {},
): Promise<ImportFileResponse> {
  return createApiClient(options).get<ImportFileResponse>(
    `/imports/${encodeURIComponent(id)}`,
  );
}

export function getImportParseResult(
  id: string,
  options: ApiClientOptions = {},
): Promise<ImportParseResultResponse> {
  return createApiClient(options).get<ImportParseResultResponse>(
    `/imports/${encodeURIComponent(id)}/parse-result`,
  );
}

export function parseImportFile(
  id: string,
  options: ApiClientOptions = {},
): Promise<ImportParseResultResponse> {
  return createApiClient(options).post<ImportParseResultResponse>(
    `/imports/${encodeURIComponent(id)}/parse`,
  );
}

export function uploadImportFile(
  file: File,
  options: UploadImportFileOptions = {},
): Promise<ImportFileResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return uploadFormData<ImportFileResponse>("/imports", formData, options);
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
    return buildApiUrl(path, this.baseUrl);
  }
}

export function buildApiUrl(path: string, baseUrl = getApiBaseUrl()): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedBaseUrl.startsWith("/")) {
    return `${normalizedBaseUrl}${normalizedPath}`;
  }

  return new URL(
    normalizedPath.replace(/^\//, ""),
    `${normalizedBaseUrl}/`,
  ).toString();
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

function uploadFormData<TResponse>(
  path: string,
  body: FormData,
  options: UploadImportFileOptions,
): Promise<TResponse> {
  if (typeof XMLHttpRequest === "undefined") {
    return Promise.reject(
      new ApiClientError({
        code: "UPLOAD_UNAVAILABLE",
        message: "File uploads must be started from a browser session.",
        status: 0,
      }),
    );
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildApiUrl(path, options.baseUrl));
    xhr.responseType = "text";

    if (options.authToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${options.authToken}`);
    }

    xhr.upload.onprogress = (event) => {
      options.onProgress?.({
        loaded: event.loaded,
        percent: event.lengthComputable
          ? (event.loaded / event.total) * 100
          : null,
        total: event.lengthComputable ? event.total : null,
      });
    };

    xhr.onerror = () => {
      reject(
        new ApiClientError({
          code: "API_NETWORK_ERROR",
          message: "The API request could not be sent.",
          status: 0,
          details: { path },
        }),
      );
    };

    xhr.onload = () => {
      const responseText =
        typeof xhr.response === "string" ? xhr.response : xhr.responseText;

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          toApiClientErrorFromPayload(
            xhr.status,
            xhr.statusText,
            xhr.getResponseHeader("content-type") ?? "",
            responseText,
          ),
        );
        return;
      }

      resolve(parseXhrSuccess<TResponse>(responseText));
    };

    xhr.send(body);
  });
}

function parseXhrSuccess<TResponse>(responseText: string): TResponse {
  if (!responseText) {
    return undefined as TResponse;
  }

  return JSON.parse(responseText) as TResponse;
}

function toApiClientErrorFromPayload(
  status: number,
  statusText: string,
  contentType: string,
  responseText: string,
): ApiClientError {
  const body = parseErrorPayload(status, statusText, contentType, responseText);

  return new ApiClientError({
    code: body.code,
    message: body.message,
    status,
    details: body.details,
    path: body.path,
    timestamp: body.timestamp,
  });
}

function parseErrorPayload(
  status: number,
  statusText: string,
  contentType: string,
  responseText: string,
): ApiErrorResponse {
  if (contentType.includes("application/json") && responseText) {
    const parsed = JSON.parse(responseText) as unknown;
    if (isApiErrorResponse(parsed)) {
      return parsed;
    }
  }

  return {
    code: `HTTP_${status}`,
    message: statusText || `API request failed with HTTP status ${status}.`,
    details: responseText ? { bodyPreview: responseText.slice(0, 500) } : {},
  };
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
