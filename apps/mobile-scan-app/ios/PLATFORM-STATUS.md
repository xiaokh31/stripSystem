# iOS Platform Project Status

Status at P6-MOBILE-11: source boundary present, generated Xcode project
blocked.

Present source boundary:

- `BestarQrScanner/BestarQrScanner.swift`
- `BestarQrScanner/BestarSecureTokenStore.swift`
- `BestarQrScanner/BestarQrScannerBridge.m`

Missing generated React Native iOS project markers:

- `Podfile`
- `*.xcodeproj`
- `*.xcworkspace`
- app target `Info.plist`

Required build machine:

- macOS with Xcode.
- CocoaPods available through the React Native iOS setup.
- Apple Developer account, company bundle identifier, signing certificate, and
  provisioning profile for device or IPA distribution.

Generation and hardening checklist:

1. Generate or restore the React Native iOS project from the pinned
   `react-native@0.84.1` template.
2. Add the `BestarQrScanner` Swift and bridge files to the app target.
3. Add `NSCameraUsageDescription` to the app target `Info.plist`.
4. Confirm the native module names are exported as `BestarQrScanner` and
   `BestarSecureTokenStore`.
5. Run `pod install` from `apps/mobile-scan-app/ios`.
6. Run a simulator smoke with `pnpm --filter mobile-scan-app ios`.
7. Run a release archive in Xcode and export an IPA through the company
   distribution channel.

Do not commit:

- `.p12`, `.cer`, `.mobileprovision`, exported `.ipa`, Apple credentials, or
  signing passwords.
- Xcode `DerivedData`, build products, or user-specific workspace state.

P6-MOBILE-11 conclusion for this checkout: iOS cannot be marked ready until the
generated Xcode project is restored or generated on the macOS build machine and
the simulator/device build result is recorded.
