import { expect, test } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./helpers";

test("admin can sign in through the browser login page", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "中文" })).toBeVisible();

  await page.getByLabel("Email").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  const cookies = await page.context().cookies();
  const authCookie = cookies.find((cookie) => cookie.name === "bestar_auth_token");
  expect(authCookie?.expires).toBeGreaterThan(
    Math.floor(Date.now() / 1000) + 300 * 24 * 60 * 60,
  );
  await expect(
    page.getByRole("heading", { name: "Operations dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("Dashboard").first()).toBeVisible();
});
