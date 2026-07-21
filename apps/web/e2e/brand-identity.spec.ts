import { expect, test } from "@playwright/test";

const expectedLinks = [
  { pathname: "/favicon.ico", rel: "icon", sizes: "16x16" },
  {
    pathname: "/images/logos/favicon-16.ico",
    rel: "icon",
    sizes: "16x16",
  },
  {
    pathname: "/images/logos/favicon-32.ico",
    rel: "icon",
    sizes: "32x32",
  },
  {
    pathname: "/images/logos/favicon.ico",
    rel: "shortcut icon",
    sizes: "16x16",
  },
  {
    pathname: "/images/logos/apple-touch-icon.png",
    rel: "apple-touch-icon",
    sizes: "180x180",
  },
] as const;

test("corporate browser identity metadata and files are served through nginx", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Bestar Warehouse Office");

  const links = await page.locator("head link[rel]").evaluateAll((elements) =>
    elements.map((element) => {
      const link = element as HTMLLinkElement;
      const url = new URL(link.href);
      return {
        pathname: url.pathname,
        rel: link.rel,
        sizes: link.sizes.value || undefined,
      };
    }),
  );

  for (const expectedLink of expectedLinks) {
    expect(links).toContainEqual(expectedLink);
  }

  const responseBodies = new Map<string, Buffer>();
  for (const { pathname } of expectedLinks) {
    const response = await request.get(pathname);
    expect(response.status(), `${pathname} status`).toBe(200);
    const contentType = response.headers()["content-type"] ?? "";
    if (pathname.endsWith(".png")) {
      expect(contentType, `${pathname} content type`).toMatch(/^image\/png\b/);
    } else {
      expect(contentType, `${pathname} content type`).toMatch(
        /^image\/(?:x-icon|vnd\.microsoft\.icon)\b/,
      );
    }
    const body = await response.body();
    expect(body.byteLength, `${pathname} body length`).toBeGreaterThan(0);
    responseBodies.set(pathname, body);
  }

  expect(responseBodies.get("/favicon.ico")).toEqual(
    responseBodies.get("/images/logos/favicon.ico"),
  );

  const origin = new URL(page.url()).origin;
  await page.context().addCookies([
    {
      name: "bestar_locale",
      sameSite: "Lax",
      url: origin,
      value: "zh-CN",
    },
  ]);
  await page.reload();
  await expect(page).toHaveTitle("Bestar 仓库办公室");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    /^(?:dark|light|system)$/,
  );
});

test("removed starter branding is not shipped", async ({ request }) => {
  for (const pathname of [
    "/file.svg",
    "/globe.svg",
    "/next.svg",
    "/vercel.svg",
    "/window.svg",
  ]) {
    expect((await request.get(pathname)).status(), pathname).toBe(404);
  }
});
