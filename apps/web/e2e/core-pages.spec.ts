import { expect, test } from "@playwright/test";
import { expectNoPageError, loginThroughApi } from "./helpers";

const pages = [
  { heading: "Operations dashboard", path: "/" },
  { heading: "Imports", path: "/imports" },
  { heading: "Containers", path: "/containers" },
  { heading: "Load jobs", path: "/load-jobs" },
  { heading: "Warehouse reports", path: "/reports" },
  { heading: "Operational settings", path: "/settings" },
  { heading: "User management", path: "/admin/users" },
  { heading: "Roles and permissions", path: "/admin/roles" },
];

test.beforeEach(async ({ page, request }) => {
  await loginThroughApi(page, request);
});

test("office shell hydrates without runtime page errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/settings");
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Operational settings",
    }),
  ).toBeVisible();

  expect(pageErrors).toEqual([]);
});

for (const item of pages) {
  test(`${item.path} renders without page errors`, async ({ page }) => {
    await page.goto(item.path);

    await expect(
      page.getByRole("heading", {
        exact: true,
        level: 1,
        name: item.heading,
      }),
    ).toBeVisible();
    await expectNoPageError(page);
  });
}
