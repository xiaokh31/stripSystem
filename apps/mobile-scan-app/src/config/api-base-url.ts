export interface ValidationFailure {
  message: string;
  ok: false;
}

export interface ValidationSuccess {
  ok: true;
  value: string;
}

export type ValidationResult = ValidationFailure | ValidationSuccess;

const supportedProtocols = new Set(["http:", "https:"]);

export function normalizeApiBaseUrl(input: string): ValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { message: "API base URL is required.", ok: false };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { message: "API base URL must be a valid URL.", ok: false };
  }

  if (!supportedProtocols.has(url.protocol)) {
    return { message: "API base URL must use http or https.", ok: false };
  }

  if (!url.hostname) {
    return { message: "API base URL must include a host.", ok: false };
  }

  url.hash = "";
  url.search = "";
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/api";
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");

  return { ok: true, value: url.toString().replace(/\/$/u, "") };
}

export function buildHealthUrl(apiBaseUrl: string): ValidationResult {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);
  if (!normalized.ok) {
    return normalized;
  }

  return { ok: true, value: `${normalized.value}/health` };
}
