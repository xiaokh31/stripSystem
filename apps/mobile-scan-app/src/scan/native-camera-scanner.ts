import { NativeModules } from "react-native";

export interface CameraScanner {
  scanOnce(): Promise<string>;
}

interface NativeQrScannerModule {
  scanOnce(): Promise<string>;
}

export function createNativeCameraScanner(): CameraScanner {
  const scanner = (NativeModules as { BestarQrScanner?: NativeQrScannerModule })
    .BestarQrScanner;

  return {
    async scanOnce(): Promise<string> {
      if (!scanner?.scanOnce) {
        throw new Error(
          "Native camera scanner module is not installed on this build. Use scanner-gun or manual input.",
        );
      }

      const payload = await scanner.scanOnce();
      if (!payload.trim()) {
        throw new Error("Native camera scanner returned an empty QR payload.");
      }

      return payload;
    },
  };
}
