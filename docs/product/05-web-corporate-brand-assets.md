# Web Corporate Brand Assets

## Decision Status

- Product requirement accepted: 2026-07-20.
- Scope: Bestar Office Web only.
- Delivery tasks: `WEB-BRAND-01` through `WEB-BRAND-03`.
- Strict `en` / `zh-CN` localization remains a release gate.

## Problem

The Office Web currently renders the company name as plain text in the desktop
rail and top header, while the browser still uses the original starter favicon.
The newly supplied Bestar logo files were originally placed under
`apps/web/public/images/logs/` without a canonical naming contract, surface rules,
Shell/login integration or browser icon metadata. WEB-BRAND-01 closed the asset
and browser-identity portion; Shell/login placement remains in WEB-BRAND-02.

Simply inserting one image would leave duplicate branding, dark-theme contrast
failures, narrow-screen clipping, layout shifts and stale generic browser
identity. The assets need one controlled system that uses each suitable variant
for a defined surface and preserves the operational character of the existing
Manifest Control Room.

## Actors And User Stories

- **Authenticated office and warehouse users** need a recognizable company
  identity without losing navigation density or operational information.
- **Users signing in** need to know they are entering the Bestar system before
  providing credentials.
- **Tablet and mobile Web users** need an unclipped compact identity while the
  navigation and actions remain usable.
- **Administrators and support staff** need browser tabs, bookmarks and home
  screen shortcuts to be distinguishable from unrelated local systems.
- **Developers** need a semantic component and asset map so later pages do not
  guess which filename belongs on which background.

## Supplied Asset Audit

Original supplied source directory: `apps/web/public/images/logs/`. WEB-BRAND-01
completed the canonical move to `apps/web/public/images/logos/` on 2026-07-20;
the table below preserves the supplied filenames for audit mapping.

| Source file | Actual dimensions | Observed role | Product decision |
| --- | ---: | --- | --- |
| `logo-dark.png` | 228 x 50 | Blue symbol with white BESTAR wordmark | Full wordmark on dark surfaces |
| `logo-white.png` | 228 x 50 | Blue symbol with dark BESTAR wordmark | Full wordmark on light surfaces |
| `logo.png` | 228 x 50 | Dimensional gray/black legacy wordmark | Preserve as an approved alternate; do not scatter it through operational UI |
| `logo-icon.png` | 64 x 64 | Compact Bestar mark | Compact Web identity at or below its native size |
| `apple-touch-icon.png` | 180 x 180 | High-resolution standalone mark | Apple touch/home-screen icon |
| `favicon-16.ico` | 16 x 16 | Browser icon | Explicit 16px favicon |
| `favicon-32.ico` | 32 x 32 | Browser icon | Explicit 32px favicon |
| `favicon.ico` | 16 x 16 | Browser fallback; binary duplicate of `favicon-16.ico` | `/favicon.ico` compatibility fallback |

The original folder name `logs` is treated as a typo. `WEB-BRAND-01` moved
the assets to the canonical `apps/web/public/images/logos/` directory and use
semantic code names such as `onDark`, `onLight` and `icon`. Filename wording is
not allowed to decide rendering behavior at each call site.

All unique supplied logo variants are retained. They do not all need to appear
on the same screen. Repeating alternate wordmarks merely to prove they are
"used" would reduce consistency and is not an acceptance criterion.

## Design Direction

The subject remains **Manifest Control Room**, an operational warehouse office
tool rather than a marketing site. The brand lockup should make the Shell
recognizable, while the Dashboard, tables, filters and work queues remain the
primary experience.

### Signature

The Bestar wordmark is integrated into the dock-steel navigation frame as the
identity plate of the control room. It is not placed in a hero, decorative card
or every page section.

### Placement Contract

1. Authenticated desktop (`lg` and wider): show one full on-dark wordmark in the
   left navigation rail. Keep the localized `Manifest Control Room` descriptor
   subordinate to it. Do not repeat a second wordmark in the desktop header.
2. Authenticated tablet/mobile: show the on-dark wordmark in the top Shell. At
   the narrowest supported width, use the compact icon plus one accessible brand
   name rather than shrinking or cropping the wordmark.
3. Unauthenticated/login: the top Shell remains the primary brand signal. The
   login form must not repeat another full wordmark when the same mark is already
   immediately visible.
4. Browser identity: use the supplied 16px, 32px, fallback favicon and 180px
   Apple touch icon through Next.js metadata/file conventions.
5. Dashboard and business pages: do not stamp logos into metrics, tables,
   empty states, cards, reports or every page heading.

### Logo Integrity

- Preserve the native aspect ratio; never stretch, crop or use `object-fit:
  cover`.
- Do not recolor, filter, add a new shadow, place the mark inside a circular
  badge, or use the logo as a translucent background decoration.
- Render the 64px compact mark at no more than its native dimensions.
- Give every rendered image explicit dimensions or an aspect-ratio box to
  prevent cumulative layout shift.
- Use the on-dark image on the fixed dark Shell and the on-light image on a
  light surface. Do not infer the variant from a misleading filename at the
  call site.
- The logo blue is corporate identity, not a replacement for existing status,
  action, warning or exception color semantics.

## Workflow

1. The browser requests the page using the persisted locale and theme.
2. Server-rendered Shell markup selects a logo variant from the known surface,
   not from a post-hydration JavaScript theme check.
3. Desktop authenticated users see the rail wordmark; smaller viewports see the
   top-Shell wordmark or compact mark according to available width.
4. Theme and locale changes preserve the same navigation state and do not flash
   a wrong logo, duplicate logo or another language.
5. Browser tabs/bookmarks request the corporate favicon endpoints and Apple
   touch devices use the supplied 180px icon.

## Business Rules

1. Only the user-supplied Bestar artwork may represent the company in this
   requirement; no generated substitute or generic starter logo is allowed.
2. A viewport has one primary Shell identity. Desktop rail and desktop header
   must not show duplicate full wordmarks at the same time.
3. Surface contrast decides the semantic logo variant. Locale, route, role and
   business status do not change the artwork.
4. The company logo never communicates operational status and never replaces a
   localized status label, warning, permission message or current-route state.
5. Browser icons and visible Shell identity use the same approved asset family,
   while preserving each file's actual dimensions and intended use.
6. Existing login, session, navigation, RBAC, health, clock and theme behavior
   remains authoritative; branding cannot change those workflows.

## Data And Component Concepts

No database or API concept is added. Web implementation should introduce:

- a typed, immutable brand asset map containing source path, natural width and
  natural height;
- one reusable `BrandLogo` or equivalent component with semantic variants
  `onDark`, `onLight` and `icon`;
- an explicit accessible-name mode so a meaningful brand image has one
  localized `alt`, while a mark adjacent to equivalent visible text is
  decorative with `alt=""`;
- metadata icon declarations and a corporate `/favicon.ico` fallback.

## I18n Management

I18n is a hard gate even though image pixels themselves are not translated.

1. `Bestar` and `Bestar Service CCA` are company proper names and may remain the
   same in both locale catalogs.
2. Every visible descriptor, tooltip, title, `aria-label`, image `alt`, login
   heading and navigation label touched by the work must use the typed
   translator and have `en` / `zh-CN` catalog parity.
3. One accessible brand name must be exposed per placement. Screen readers must
   not hear the wordmark and adjacent duplicate text twice.
4. English and Chinese pages show one UI language at a time. The English letters
   embedded in the registered/corporate wordmark are not treated as an English
   UI fallback.
5. Locale selection must be correct in SSR HTML, first visible frame,
   hydration, refresh and client navigation. No DOM translation walker or
   delayed asset swap may be introduced.
6. The API is unchanged. If implementation unexpectedly introduces a dynamic
   status or error, it must use a stable code/key and Web-side localization,
   never an API-localized sentence.

## Accessibility And Responsive Rules

- Support 320px, 390px, 768px, 1366px, 1920px and 2560px widths without page
  overflow, logo clipping or action overlap.
- Support browser zoom at 125% and 200% and long English/Chinese role labels.
- A logo must not displace the theme control, language switcher, sign in/logout,
  current user, health status or mobile navigation.
- Preserve logical landmark and keyboard order. The logo is not a link unless
  the product gives it a clear home-navigation action; if it is a link, provide
  a localized accessible name and visible focus.
- Do not rely on the image alone to communicate system health, current route or
  permissions.

## Performance And Delivery Rules

- Serve all assets locally; no runtime request to a third-party CDN or font
  service.
- Use explicit dimensions and an appropriate loading priority for above-fold
  Shell identity.
- Do not load both full light and dark wordmarks for one fixed Shell surface.
- Do not add a client effect/listener solely to choose a logo variant.
- Keep the supplied raster files at their natural quality. Do not upscale the
  64px or 180px mark and claim a new high-resolution PWA icon.
- The supplied files do not include 192px and 512px install icons. Full PWA
  installability/icon generation is therefore outside this requirement unless a
  vector or approved high-resolution master is later supplied.

## Phase Split

1. **WEB-BRAND-01**: canonicalize assets, create the semantic component/asset
   contract, replace browser identity and remove unreferenced starter branding.
2. **WEB-BRAND-02**: integrate the brand contract into authenticated desktop,
   tablet/mobile Shell and unauthenticated login without changing operations.
3. **WEB-BRAND-03**: close i18n, theme, accessibility, responsive, metadata,
   performance and visual regression gates in Docker full stack.

## Acceptance Criteria

1. The supplied corporate icons replace the generic browser/favicon identity.
2. Authenticated desktop has one clear rail wordmark; tablet/mobile and login
   have one clear top-Shell identity.
3. The Shell never stretches, crops, duplicates or hides the logo behind other
   controls.
4. Light, dark and system theme paths select a contrast-safe asset from the
   first rendered frame.
5. English and Chinese locale switching remains explicit and single-language,
   with no hydration flash or unmanaged accessible text.
6. Existing navigation, route-active state, health, user/roles, RBAC, logout,
   theme and language controls are behaviorally unchanged.
7. No generic Next.js/Vercel starter image remains referenced or shipped when
   it is confirmed unused.
8. Web lint, typecheck, unit tests, production build, focused Docker Playwright,
   asset endpoint checks, screenshots and `git diff --check` pass.
9. No API, database, Worker, payroll, inventory, scanning or report-template
   behavior changes.

## Testing Decisions

- Unit/static tests own the semantic asset map, dimensions, variant contract,
  alt/decorative behavior and metadata declarations.
- Existing i18n AST/catalog tests must include the new component and touched
  Shell/login files.
- Playwright owns real `/favicon.ico`/icon response checks, authenticated and
  unauthenticated placement, locale/theme persistence, no overflow, no broken
  image, and screenshot geometry.
- Visual evidence is deliberately high-signal rather than a combinatorial dump:
  no more than 18 final screenshots, each opened and inspected at original
  resolution.

## Assumptions And Open Questions

- The observed logo colors and transparent backgrounds are approved corporate
  artwork.
- `logo-dark.png` means "for a dark surface" and `logo-white.png` means "for a
  light surface", based on inspected pixels rather than filename alone.
- A vector/high-resolution master has not been supplied. If future PWA stores,
  social previews, print artifacts or large-format screens need one, obtain an
  approved master instead of tracing or inventing a replacement.

## Out Of Scope

- Native Android/iOS launcher icons, splash screens or the `BESTAR SCAN` header.
- Excel unloading reports, wage files, pallet-label PDFs and print templates.
- Email templates, public marketing pages and social-media campaign artwork.
- Recoloring or redrawing the company logo.
- New API endpoints, schema migrations or business permissions.
