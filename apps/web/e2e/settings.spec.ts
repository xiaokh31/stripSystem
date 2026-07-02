import { expect, test } from "@playwright/test";
import { expectNoPageError, loginThroughApi } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await loginThroughApi(page, request);
});

test("admin can edit and persist operational settings", async ({ page }) => {
  await page.goto("/settings");

  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Operational settings",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Editable operational settings" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeEnabled();

  const originalSettings = {
    deliveryPhase: await page.getByLabel(/Delivery phase/).inputValue(),
    qrTargetSizeMm: await page.getByLabel(/QR target size mm/).inputValue(),
    siteName: await page.getByLabel(/Site name/).inputValue(),
  };

  try {
    const siteName = `Bestar E2E ${Date.now()}`;
    await page.getByLabel(/Site name/).fill(siteName);
    await page.getByLabel(/Delivery phase/).selectOption("Production");
    await page.getByLabel(/QR target size mm/).fill("28");
    await page.getByRole("button", { name: "Save settings" }).click();

    await expect(page.getByText(/Operational settings saved/)).toBeVisible();
    await page.reload();

    await expect(page.getByLabel(/Site name/)).toHaveValue(siteName);
    await expect(page.getByLabel(/Delivery phase/)).toHaveValue("Production");
    await expect(page.getByLabel(/QR target size mm/)).toHaveValue("28");
    await expectNoPageError(page);
  } finally {
    await page.getByLabel(/Site name/).fill(originalSettings.siteName);
    await page
      .getByLabel(/Delivery phase/)
      .selectOption(originalSettings.deliveryPhase);
    await page
      .getByLabel(/QR target size mm/)
      .fill(originalSettings.qrTargetSizeMm);
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/Operational settings saved/)).toBeVisible();
  }
});
