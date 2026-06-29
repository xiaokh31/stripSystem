export interface UserRoleResponseDto {
  id: string;
  code: string;
  displayName: string;
  permissions: string[];
}

export interface UserResponseDto {
  id: string;
  email: string | null;
  name: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: UserRoleResponseDto[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserListResponseDto {
  items: UserResponseDto[];
}

export interface UserMutationResponseDto {
  user: UserResponseDto;
  audit: {
    actorUserId: string;
    action: string;
    targetUserId: string;
  };
}
