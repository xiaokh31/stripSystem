import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const E2E_ADMIN_EMAIL = readRequiredEnv("E2E_ADMIN_EMAIL");
export const E2E_ADMIN_PASSWORD = readRequiredEnv("E2E_ADMIN_PASSWORD");
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1";

export async function loginThroughApi(
  page: Page,
  request: APIRequestContext,
): Promise<string> {
  const response = await request.post("/api/auth/login", {
    data: {
      email: E2E_ADMIN_EMAIL,
      password: E2E_ADMIN_PASSWORD,
    },
  });

  expect(
    response.ok(),
    `E2E admin login failed. Seed ${E2E_ADMIN_EMAIL} or set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD.`,
  ).toBe(true);

  const body = (await response.json()) as {
    accessToken: string;
    expiresIn: number;
  };
  await page.context().addCookies([
    {
      httpOnly: false,
      name: "bestar_auth_token",
      sameSite: "Lax",
      secure: false,
      url: E2E_BASE_URL,
      value: body.accessToken,
    },
  ]);
  return body.accessToken;
}

export async function expectNoPageError(page: Page): Promise<void> {
  await expect(page.getByText("Page error")).toHaveCount(0);
  await expect(page.getByText("Settings could not be loaded")).toHaveCount(0);
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for browser E2E tests.`);
  }
  return value;
}
