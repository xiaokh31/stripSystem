# BestarQrScanner Windows Module

This folder contains the reviewable React Native Windows native module boundary
for `NativeModules.BestarQrScanner.scanOnce()` and
`NativeModules.BestarSecureTokenStore`.

Current blocker: the repository still has only a Windows placeholder directory,
not a generated `.sln`/`.vcxproj` or C# module project. Windows camera QR
decoding also needs an approved decoder dependency after the solution is
generated. Until that platform work is complete, scanner-gun and manual input
remain the Windows fallback.

`BestarSecureTokenStoreModule.cs` uses Windows Credential Locker for JWT storage.
After the React Native Windows solution is generated, include the module in the
C# project and verify login persistence, app restart restore, expired-token
cleanup, and logout cleanup on a Windows test device. JWT values must not be
stored in AsyncStorage.

See `../PLATFORM-STATUS.md` for the generated project markers and the exact
P6-MOBILE-11 blocking conditions.
