export interface CameraScanner {
  scanOnce(): Promise<string>;
}

interface NativeQrScannerModule {
  scanOnce(): Promise<unknown>;
}

export interface NativeCameraModuleMap {
  BestarQrScanner?: NativeQrScannerModule | null;
}

export function createNativeCameraScanner(
  nativeModules: NativeCameraModuleMap = loadReactNativeModules(),
): CameraScanner {
  const scanner = nativeModules.BestarQrScanner;

  return {
    async scanOnce(): Promise<string> {
      if (typeof scanner?.scanOnce !== "function") {
        throw new Error(
          "Native camera scanner module is not installed on this build. Use scanner-gun or manual input.",
        );
      }

      const payload = await scanner.scanOnce();
      if (typeof payload !== "string") {
        throw new Error("Native camera scanner returned a non-string QR payload.");
      }

      const normalizedPayload = payload.trim();
      if (!normalizedPayload) {
        throw new Error("Native camera scanner returned an empty QR payload.");
      }

      return normalizedPayload;
    },
  };
}

function loadReactNativeModules(): NativeCameraModuleMap {
  const reactNative = require("react-native") as {
    NativeModules?: NativeCameraModuleMap;
  };
  return reactNative.NativeModules ?? {};
}
