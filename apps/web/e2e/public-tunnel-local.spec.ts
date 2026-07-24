import { expect, test } from "@playwright/test";
import { E2E_BASE_URL, loginThroughApi } from "./helpers";

const uploadLimitMessages = {
  en: "This file is larger than the 50 MB application upload limit. Choose a smaller .xlsx file.",
  "zh-CN": "该文件超过应用的 50 MB 上传限制。请选择较小的 .xlsx 文件。",
} as const;

test("oversize import fails locally with strict single-language guidance", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const browserErrors: string[] = [];
  let importPostCount = 0;
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (browserRequest) => {
    if (
      browserRequest.method() === "POST" &&
      new URL(browserRequest.url()).pathname === "/api/imports"
    ) {
      importPostCount += 1;
    }
  });

  await loginThroughApi(page, request);

  for (const locale of ["en", "zh-CN"] as const) {
    await page.context().addCookies([
      {
        name: "bestar_locale",
        sameSite: "Lax",
        url: new URL(E2E_BASE_URL).origin,
        value: locale,
      },
    ]);
    await page.goto("/imports/new", { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", locale);

    await page.locator("#import-files").evaluate((input) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(
        new File(
          [new Uint8Array(50 * 1024 * 1024 + 1)],
          "oversize-boundary.xlsx",
          {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        ),
      );
      (input as HTMLInputElement).files = dataTransfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const expectedMessage = uploadLimitMessages[locale];
    const otherMessage =
      uploadLimitMessages[locale === "en" ? "zh-CN" : "en"];
    await expect(page.getByText(expectedMessage, { exact: true })).toBeVisible();
    await expect(page.getByText(otherMessage, { exact: true })).toHaveCount(0);
    await expect(page.getByText("UPLOAD_FILE_TOO_LARGE", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: locale === "en" ? /Upload/ : /上传/ }))
      .toBeDisabled();
  }

  expect(importPostCount).toBe(0);
  expect(browserErrors, "console/page/hydration errors").toEqual([]);
});
