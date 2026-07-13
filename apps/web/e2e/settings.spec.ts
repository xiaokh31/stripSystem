import { expect, test, type Page } from "@playwright/test";
import {
  E2E_BASE_URL,
  ensureTestUser,
  expectNoPageError,
  loginThroughApi,
  loginWithCredentials,
} from "./helpers";

const officeSettingsUser = {
  email: "e2e-dashboard-office@bestarcca.com",
  name: "E2E Dashboard Office",
  password: "Bestar-E2E-Dashboard-Office-123!",
  roleCodes: ["OFFICE"],
} as const;

test("admin can edit pallet dimensions and immediately receives backend capacities", async ({
  page,
  request,
}) => {
  await loginThroughApi(page, request);
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
    palletLengthM: await page.getByTestId("pallet-length-input").inputValue(),
    palletWidthM: await page.getByTestId("pallet-width-input").inputValue(),
    qrTargetSizeMm: await page.getByLabel(/QR target size mm/).inputValue(),
    siteName: await page.getByLabel(/Site name/).inputValue(),
  };

  try {
    const siteName = `Bestar E2E ${Date.now()}`;
    await page.getByLabel(/Site name/).fill(siteName);
    await page.getByLabel(/Delivery phase/).selectOption("Production");
    await page.getByLabel(/QR target size mm/).fill("28");
    await page.getByTestId("pallet-length-input").fill("1.1");
    await page.getByTestId("pallet-width-input").fill("1.2");
    await page.getByRole("button", { name: "Save settings" }).click();

    await expect(page.getByText(/Operational settings saved/)).toBeVisible();
    await expect(page.getByTestId("pallet-low-height-capacity")).toHaveText(
      "2.244 CBM",
    );
    await expect(page.getByTestId("pallet-other-height-capacity")).toHaveText(
      "2.904 CBM",
    );
    await page.reload();

    await expect(page.getByLabel(/Site name/)).toHaveValue(siteName);
    await expect(page.getByLabel(/Delivery phase/)).toHaveValue("Production");
    await expect(page.getByLabel(/QR target size mm/)).toHaveValue("28");
    await expect(page.getByTestId("pallet-length-input")).toHaveValue("1.1");
    await expect(page.getByTestId("pallet-width-input")).toHaveValue("1.2");
    await expect(page.getByTestId("pallet-low-height-capacity")).toHaveText(
      "2.244 CBM",
    );
    await expect(page.getByTestId("pallet-other-height-capacity")).toHaveText(
      "2.904 CBM",
    );
    await expectNoPageError(page);
  } finally {
    if (!page.url().includes("/settings")) {
      await page.goto("/settings");
    }
    await page.getByLabel(/Site name/).fill(originalSettings.siteName);
    await page
      .getByLabel(/Delivery phase/)
      .selectOption(originalSettings.deliveryPhase);
    await page
      .getByLabel(/QR target size mm/)
      .fill(originalSettings.qrTargetSizeMm);
    await page
      .getByTestId("pallet-length-input")
      .fill(originalSettings.palletLengthM);
    await page
      .getByTestId("pallet-width-input")
      .fill(originalSettings.palletWidthM);
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/Operational settings saved/)).toBeVisible();
  }
});

test("OFFICE can review pallet policy but cannot edit settings", async ({
  page,
  request,
}) => {
  const adminToken = await loginThroughApi(page, request);
  const officeUser = await ensureTestUser(request, adminToken, {
    ...officeSettingsUser,
    roleCodes: [...officeSettingsUser.roleCodes],
  });
  await loginWithCredentials(page, request, officeUser);
  await page.goto("/settings");

  await expect(page.getByTestId("pallet-calculation-section")).toBeVisible();
  await expect(
    page.getByText(
      "You can view operational settings, but your role cannot edit them.",
    ),
  ).toBeVisible();
  await expect(page.getByTestId("pallet-length-input")).toBeDisabled();
  await expect(page.getByTestId("pallet-width-input")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
  await expectNoPageError(page);
});

test("pallet settings remain single-language, themed, and unclipped across viewports", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await loginThroughApi(page, request);

  for (const locale of ["en", "zh-CN"] as const) {
    for (const theme of ["light", "dark"] as const) {
      await page.context().addCookies([
        browserCookie("bestar_locale", locale),
        browserCookie("bestar_theme", theme),
      ]);

      for (const viewport of [
        { height: 844, width: 390 },
        { height: 1024, width: 768 },
        { height: 768, width: 1366 },
        { height: 1080, width: 1920 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto("/settings", { waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        const section = page.getByTestId("pallet-calculation-section");
        const expectedTitle = locale === "zh-CN" ? "托盘计算" : "Pallet calculation";
        const otherTitle = locale === "zh-CN" ? "Pallet calculation" : "托盘计算";
        await expect(section.getByRole("heading", { name: expectedTitle })).toBeVisible();
        await expect(section).not.toContainText(otherTitle);
        await expect(page.getByTestId("pallet-length-input")).toBeVisible();
        await expect(page.getByTestId("pallet-width-input")).toBeVisible();
        await expect(page.getByTestId("pallet-low-height-capacity")).toBeVisible();
        await expect(page.getByTestId("pallet-other-height-capacity")).toBeVisible();

        const valuesBeforeRefresh = await palletValues(page);
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        expect(await palletValues(page)).toEqual(valuesBeforeRefresh);
        await assertPalletSettingsGeometry(page, viewport.width);
        await assertPalletSettingsContrast(page);
        await page.screenshot({
          fullPage: true,
          path: `test-results/unload-pallet-08-settings-${locale}-${theme}-${viewport.width}x${viewport.height}.png`,
        });
        await expectNoPageError(page);
      }
    }
  }
});

async function palletValues(page: Page): Promise<Record<string, string>> {
  return {
    length: await page.getByTestId("pallet-length-input").inputValue(),
    lowCapacity: await page.getByTestId("pallet-low-height-capacity").innerText(),
    otherCapacity: await page.getByTestId("pallet-other-height-capacity").innerText(),
    width: await page.getByTestId("pallet-width-input").inputValue(),
  };
}

async function assertPalletSettingsContrast(page: Page): Promise<void> {
  const colors = await page
    .getByTestId("pallet-calculation-section")
    .evaluate((section) => ({
      background: getComputedStyle(section).backgroundColor,
      foreground: getComputedStyle(section.querySelector("h3")!).color,
    }));
  expect(
    contrastRatio(colors.foreground, colors.background),
    `pallet settings text contrast for ${colors.foreground} on ${colors.background}`,
  ).toBeGreaterThanOrEqual(4.5);
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(rgbChannels(foreground));
  const backgroundLuminance = relativeLuminance(rgbChannels(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbChannels(value: string): [number, number, number] {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Unsupported computed color: ${value}`);
  }
  return channels as [number, number, number];
}

function relativeLuminance(channels: [number, number, number]): number {
  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

async function assertPalletSettingsGeometry(
  page: Page,
  viewportWidth: number,
): Promise<void> {
  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(pageOverflows, `${viewportWidth}px page should not overflow horizontally`).toBe(
    false,
  );

  const sectionMetrics = await page
    .getByTestId("pallet-calculation-section")
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth,
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
      };
    });
  expect(sectionMetrics.scrollWidth).toBeLessThanOrEqual(sectionMetrics.clientWidth + 1);
  expect(sectionMetrics.left).toBeGreaterThanOrEqual(0);
  expect(sectionMetrics.right).toBeLessThanOrEqual(viewportWidth + 1);

  const controlsFit = await page
    .getByTestId("pallet-dimension-control")
    .evaluateAll((elements) =>
      elements.every(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    );
  expect(controlsFit, `${viewportWidth}px dimension controls should not clip`).toBe(true);
}

function browserCookie(name: string, value: string) {
  return {
    httpOnly: false,
    name,
    sameSite: "Lax" as const,
    secure: false,
    url: E2E_BASE_URL,
    value,
  };
}
