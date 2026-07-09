# BestarQrScanner iOS Module

This folder contains the reviewable iOS native module source for
`NativeModules.BestarQrScanner.scanOnce()` and
`NativeModules.BestarSecureTokenStore`.

Integration blocker: the repository still has only an iOS placeholder directory,
not a generated Xcode workspace. After `react-native init`/platform generation,
add these files to the app target, ensure the Swift bridging header imports
React, and add `NSCameraUsageDescription` to `Info.plist`. The secure token
store uses Keychain generic-password storage with
`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`; JWT values must not be
stored in AsyncStorage.

Device acceptance requires a physical iPhone/iPad camera test. Simulator builds
cannot validate QR camera scanning.

See `../PLATFORM-STATUS.md` for the generated project markers and the exact
P6-MOBILE-11 blocking conditions.
