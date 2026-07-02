import { buildHealthUrl } from "../config/api-base-url";

export interface HealthCheckResult {
  checkedAt: string;
  message: string;
  ok: boolean;
  status?: number;
}

export interface HealthCheckOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

export async function checkApiHealth(
  apiBaseUrl: string,
  options: HealthCheckOptions = {},
): Promise<HealthCheckResult> {
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  const healthUrl = buildHealthUrl(apiBaseUrl);
  if (!healthUrl.ok) {
    return { checkedAt, message: healthUrl.message, ok: false };
  }

  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(healthUrl.value, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        checkedAt,
        message: `API health returned HTTP ${response.status}.`,
        ok: false,
        status: response.status,
      };
    }

    return {
      checkedAt,
      message: "API is reachable.",
      ok: true,
      status: response.status,
    };
  } catch (error) {
    return {
      checkedAt,
      message:
        error instanceof Error
          ? `API health check failed: ${error.message}`
          : "API health check failed.",
      ok: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}
