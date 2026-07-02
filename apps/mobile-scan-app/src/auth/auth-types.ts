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

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  user: AuthUser;
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
  | "session_expired"
  | "permission_denied"
  | "error";
