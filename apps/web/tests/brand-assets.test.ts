import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo } from "../src/components/brand/brand-logo";
import {
  BRAND_ASSETS,
  BRAND_LOGO_VARIANTS,
  getBrandIconMetadata,
} from "../src/lib/brand-assets";

const publicRoot = path.join(process.cwd(), "public");
const appRoot = path.join(process.cwd(), "src/app");

const expectedAssets = {
  appleTouchIcon: {
    sha256: "ab5a08ab94030eef02c0ae253badbe7cd153d199c89dcdcd750d183ba24ac893",
  },
  dimensionalAlternate: {
    sha256: "896a0e3b40a1f1ba7723474d3291fbf6a41abc9336ff040d7d60ce0db694a234",
  },
  favicon: {
    sha256: "a532ed8bafdb30357a8148ff7c9ba00fcf9392ca612fe65d6f5e627aaf6e4e22",
  },
  favicon16: {
    sha256: "a532ed8bafdb30357a8148ff7c9ba00fcf9392ca612fe65d6f5e627aaf6e4e22",
  },
  favicon32: {
    sha256: "09f961db1b549519413472064d29546c009c522348f3d2c28d0fb673e6ac4be5",
  },
  icon: {
    sha256: "a43f2be576c189838718e584bdc2f7728d1ed5076bb6d5d384353e8212e83a9a",
  },
  onDark: {
    sha256: "118ba4e8f2c85caa422365d88de4fa26ea8934b291ca45523def5401b79a850c",
  },
  onLight: {
    sha256: "a2c0d0c45f60c2dc28a643520a15cebbc43671b8b1556844d216441afe25a82f",
  },
} as const;

test("brand asset contract is immutable and preserves supplied artwork", () => {
  assert.equal(Object.isFrozen(BRAND_ASSETS), true);

  for (const [key, expected] of Object.entries(expectedAssets)) {
    const asset = BRAND_ASSETS[key as keyof typeof BRAND_ASSETS];
    const filePath = path.join(publicRoot, asset.src.slice(1));
    const contents = fs.readFileSync(filePath);

    assert.equal(Object.isFrozen(asset), true, `${key} must be immutable`);
    assert.equal(sha256(contents), expected.sha256, `${key} artwork changed`);
    assert.deepEqual(readImageDimensions(contents), {
      height: asset.naturalHeight,
      width: asset.naturalWidth,
    });
  }

  assert.equal(
    sha256(fs.readFileSync(path.join(appRoot, "favicon.ico"))),
    expectedAssets.favicon.sha256,
    "the app fallback must be the supplied corporate favicon",
  );

  assert.equal(BRAND_ASSETS.onDark.src, "/images/logos/wordmark-on-dark.png");
  assert.equal(BRAND_ASSETS.onDark.surface, "dark");
  assert.equal(BRAND_ASSETS.onLight.src, "/images/logos/wordmark-on-light.png");
  assert.equal(BRAND_ASSETS.onLight.surface, "light");
  assert.equal(
    BRAND_ASSETS.dimensionalAlternate.src,
    "/images/logos/wordmark-dimensional.png",
  );
  assert.notEqual(BRAND_ASSETS.onDark.src, BRAND_ASSETS.onLight.src);
  assert.notEqual(
    BRAND_ASSETS.onDark.src,
    BRAND_ASSETS.dimensionalAlternate.src,
  );
});

test("brand logo variants keep native geometry and explicit alt behavior", () => {
  assert.deepEqual(BRAND_LOGO_VARIANTS, ["onDark", "onLight", "icon"]);

  for (const variant of BRAND_LOGO_VARIANTS) {
    const asset = BRAND_ASSETS[variant];
    const decorativeHtml = renderToStaticMarkup(
      createElement(BrandLogo, { accessibility: "decorative", variant }),
    );
    const meaningfulHtml = renderToStaticMarkup(
      createElement(BrandLogo, {
        accessibility: "meaningful",
        accessibleName: "Bestar Service CCA",
        locale: "en",
        variant,
      }),
    );
    const meaningfulChineseHtml = renderToStaticMarkup(
      createElement(BrandLogo, {
        accessibility: "meaningful",
        accessibleName: "Bestar Warehouse Office",
        locale: "zh-CN",
        variant,
      }),
    );

    assert.match(decorativeHtml, /alt=""/);
    assert.match(meaningfulHtml, /alt="Bestar Service CCA"/);
    assert.match(meaningfulChineseHtml, /alt="Bestar 仓库办公室"/);
    assert.match(meaningfulHtml, new RegExp(`width="${asset.naturalWidth}"`));
    assert.match(meaningfulHtml, new RegExp(`height="${asset.naturalHeight}"`));
    assert.match(meaningfulHtml, new RegExp(`data-brand-logo="${variant}"`));
    assert.doesNotMatch(meaningfulHtml, /object-fit:cover|filter:/);
    if (variant === "onDark") {
      assert.match(meaningfulHtml, /class="brand-logo-transparent-on-dark"/);
    } else {
      assert.doesNotMatch(meaningfulHtml, /brand-logo-transparent-on-dark/);
    }
  }

  assert.equal(BRAND_ASSETS.onDark.naturalWidth / BRAND_ASSETS.onDark.naturalHeight, 228 / 50);
  assert.equal(BRAND_ASSETS.onLight.naturalWidth / BRAND_ASSETS.onLight.naturalHeight, 228 / 50);
  assert.equal(BRAND_ASSETS.icon.naturalWidth, 64);
  assert.equal(BRAND_ASSETS.icon.naturalHeight, 64);
});

test("responsive shell logo selects the compact supplied mark below 360px", () => {
  const html = renderToStaticMarkup(
    createElement(BrandLogo, {
      accessibility: "meaningful",
      accessibleName: "Bestar Service CCA",
      locale: "en",
      responsiveCompact: true,
      variant: "onDark",
    }),
  );

  assert.match(html, /<picture data-brand-logo-responsive="true">/);
  assert.match(html, /media="\(max-width: 359px\)"/);
  assert.match(html, /srcSet="\/images\/logos\/compact-mark\.png"/);
  assert.match(
    html,
    /class="brand-logo-transparent-on-dark shell-brand-logo-responsive"/,
  );
  assert.match(html, /alt="Bestar Service CCA"/);
  assert.equal((html.match(/alt="Bestar Service CCA"/g) ?? []).length, 1);
});

test("brand rendering has no client theme selector, listener, timer, or asset swap", () => {
  const componentSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/brand/brand-logo.tsx"),
    "utf8",
  );

  assert.doesNotMatch(
    componentSource,
    /useEffect|matchMedia|MutationObserver|setInterval|setTimeout|data-theme|prefers-color-scheme/,
  );
  assert.doesNotMatch(componentSource, /wordmark-(?:on-dark|on-light|dimensional)/);
  assert.match(componentSource, /const asset = BRAND_ASSETS\[props\.variant\]/);
});

test("on-dark wordmark uses the approved transparent alpha mask and resets it for compact mode", () => {
  const styles = fs.readFileSync(
    path.join(process.cwd(), "src/app/globals.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.brand-logo-transparent-on-dark\s*\{[\s\S]*mask-image:\s*url\("\/images\/logos\/wordmark-dimensional\.png"\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 359px\)[\s\S]*\.brand-logo-transparent-on-dark\.shell-brand-logo-responsive\s*\{[\s\S]*mask-image:\s*none/,
  );
  assert.doesNotMatch(styles, /mix-blend-mode|background(?:-color)?:\s*(?:black|#000)/);
});

test("browser icon metadata uses only canonical typed asset URLs", () => {
  assert.deepEqual(getBrandIconMetadata(), {
    apple: [
      {
        sizes: "180x180",
        type: "image/png",
        url: BRAND_ASSETS.appleTouchIcon.src,
      },
    ],
    icon: [
      {
        sizes: "16x16",
        type: "image/x-icon",
        url: BRAND_ASSETS.favicon16.src,
      },
      {
        sizes: "32x32",
        type: "image/x-icon",
        url: BRAND_ASSETS.favicon32.src,
      },
    ],
    shortcut: [
      {
        sizes: "16x16",
        type: "image/x-icon",
        url: BRAND_ASSETS.favicon.src,
      },
    ],
  });

  const layoutSource = fs.readFileSync(path.join(appRoot, "layout.tsx"), "utf8");
  assert.match(layoutSource, /title: t\("Bestar Warehouse Office"\)/);
  assert.match(
    layoutSource,
    /description: t\("Office console for Bestar warehouse unloading operations"\)/,
  );
  assert.match(layoutSource, /icons: getBrandIconMetadata\(\)/);
});

test("legacy logo directory, Finder metadata, and unreferenced starter SVGs are absent", () => {
  assert.equal(fs.existsSync(path.join(publicRoot, "images/logs")), false);
  assert.deepEqual(findNamedFiles(publicRoot, ".DS_Store"), []);

  for (const fileName of [
    "file.svg",
    "globe.svg",
    "next.svg",
    "vercel.svg",
    "window.svg",
  ]) {
    assert.equal(fs.existsSync(path.join(publicRoot, fileName)), false);
  }
});

function findNamedFiles(root: string, name: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return findNamedFiles(entryPath, name);
    }
    return entry.name === name ? [entryPath] : [];
  });
}

function readImageDimensions(contents: Buffer): { height: number; width: number } {
  if (contents.subarray(1, 4).toString("ascii") === "PNG") {
    return {
      height: contents.readUInt32BE(20),
      width: contents.readUInt32BE(16),
    };
  }

  assert.equal(contents.readUInt16LE(0), 0, "invalid ICO reserved header");
  assert.equal(contents.readUInt16LE(2), 1, "invalid ICO type");
  assert.equal(contents.readUInt16LE(4), 1, "ICO must contain one supplied size");
  return {
    height: contents[7] || 256,
    width: contents[6] || 256,
  };
}

function sha256(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}
