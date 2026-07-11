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
