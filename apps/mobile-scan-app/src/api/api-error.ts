import type { ApiErrorPayload } from "../auth/auth-types";

export class NativeApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly path?: string;
  readonly status: number;
  readonly timestamp?: string;

  constructor(input: {
    code: string;
    details?: unknown;
    message: string;
    path?: string;
    status: number;
    timestamp?: string;
  }) {
    super(input.message);
    this.name = "NativeApiError";
    this.code = input.code;
    this.details = input.details ?? {};
    this.path = input.path;
    this.status = input.status;
    this.timestamp = input.timestamp;
  }
}

export async function toNativeApiError(
  response: Response,
): Promise<NativeApiError> {
  const payload = await readErrorPayload(response);
  return new NativeApiError({
    code: payload.code ?? `HTTP_${response.status}`,
    details: payload.details,
    message: payload.message ?? `API request failed with HTTP ${response.status}.`,
    path: payload.path,
    status: response.status,
    timestamp: payload.timestamp,
  });
}

async function readErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    const parsed = (await response.json()) as ApiErrorPayload;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
