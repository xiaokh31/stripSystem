# Use a Native Scan App for Warehouse Camera Scanning

## Delivery Status Override (2026-07-15)

Android and iOS remain the active installed-app delivery targets. The Windows
React Native Windows/MSIX package route is archived until an explicit future
product decision reactivates it. The Windows architecture and handoff material
below remain valid design references, but they are not an active release gate.

Warehouse mobile scanning must be delivered as an installed native app, not as a
browser page or WebView-first wrapper, because the LAN deployment can hit browser
HTTPS camera restrictions. The recommended implementation path is React Native
with React Native Windows so Android, iOS, and Windows can share TypeScript
business/UI code while still using native camera, storage, keyboard/scanner, and
packaging capabilities. The existing Web/PWA mobile scan page remains a workflow
reference and fallback, but it is not the target P6-MOBILE client.
