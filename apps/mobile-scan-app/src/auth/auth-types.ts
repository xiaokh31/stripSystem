export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface NativeLoginRequest extends LoginRequest {
  appVersion?: string;
  deviceId: string;
  platform?: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  user: AuthUser;
}

export interface NativeSessionResponse extends LoginResponse {
  accessExpiresAt: string;
  refreshExpiresIn: number;
  refreshExpiresAt: string;
  refreshToken: string;
  sessionId: string;
}

export interface ApiErrorPayload {
  code?: string;
  details?: unknown;
  message?: string;
  path?: string;
  timestamp?: string;
}

export type AuthStatus =
  | "checking"
  | "logged_out"
  | "authenticated"
  | "offline"
  | "session_expired"
  | "permission_denied"
  | "error";
