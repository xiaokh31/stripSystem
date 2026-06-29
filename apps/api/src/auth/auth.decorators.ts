import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { AuthenticatedRequest, AuthenticatedUser } from './auth-user';
import { PermissionCode } from './permissions';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const REQUIRED_PERMISSIONS_KEY = 'auth:requiredPermissions';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
