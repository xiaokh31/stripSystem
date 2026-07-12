import type { AuthSession } from "../auth/auth-session";
import type { LoadJob } from "../load-jobs/load-job-types";

export type NativeScreen = "login" | "load-jobs" | "scan" | "settings";

export function initialNativeScreen(session: AuthSession): NativeScreen {
  return session.user ? "load-jobs" : "login";
}

export function resolveNativeScreen(input: {
  requested: NativeScreen;
  session: AuthSession;
  selectedLoadJob: LoadJob | null;
}): NativeScreen {
  if (!input.session.user) return input.requested === "settings" ? "settings" : "login";
  if (input.requested === "scan" && !input.selectedLoadJob) return "load-jobs";
  return input.requested;
}
