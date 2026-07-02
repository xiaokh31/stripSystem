declare module "react" {
  export type ReactNode = unknown;
  export function createElement(
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown;
  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[],
  ): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useState<T>(
    initialValue: T,
  ): [T, (value: T | ((current: T) => T)) => void];
  const React: {
    createElement: typeof createElement;
  };
  export default React;
}

declare module "react-native" {
  export const AppRegistry: {
    registerComponent(name: string, factory: () => unknown): void;
  };
  export const NativeModules: Record<string, unknown>;
  export const SafeAreaView: unknown;
  export const ScrollView: unknown;
  export const Text: unknown;
  export const TextInput: unknown;
  export const TouchableOpacity: unknown;
  export const View: unknown;
}

declare module "@react-native-async-storage/async-storage" {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
    setItem(key: string, value: string): Promise<void>;
  };
  export default AsyncStorage;
}
