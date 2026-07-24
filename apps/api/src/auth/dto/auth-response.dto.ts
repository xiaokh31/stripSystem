export interface AuthUserResponseDto {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
}

export interface LoginResponseDto {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUserResponseDto;
}

export interface NativeSessionResponseDto extends LoginResponseDto {
  accessExpiresAt: string;
  refreshExpiresIn: number;
  refreshExpiresAt: string;
  refreshToken: string;
  sessionId: string;
}

export interface BrowserSessionResponseDto {
  accessExpiresAt: string;
  expiresIn: number;
  sessionExpiresAt: string;
  user: AuthUserResponseDto;
}
