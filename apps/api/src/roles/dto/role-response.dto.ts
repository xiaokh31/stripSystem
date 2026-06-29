export interface PermissionResponseDto {
  id: string;
  code: string;
  category: string | null;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoleResponseDto {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: PermissionResponseDto[];
  createdAt: string;
  updatedAt: string;
}

export interface RoleListResponseDto {
  items: RoleResponseDto[];
}

export interface PermissionListResponseDto {
  items: PermissionResponseDto[];
}

export interface RoleMutationResponseDto {
  role: RoleResponseDto;
  audit: {
    actorUserId: string;
    action: string;
    targetRoleId: string;
  };
}
