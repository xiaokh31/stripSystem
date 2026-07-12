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
  refreshExpiresIn: number;
  refreshToken: string;
  sessionId: string;
}
