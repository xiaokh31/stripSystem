import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest, AuthenticatedUser } from './auth-user';
import { IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY } from './auth.decorators';
import { PermissionCode, PERMISSIONS, ROLE_CODES } from './permissions';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.isPublic(context)) {
      return true;
    }

    const requiredPermissions = this.requiredPermissions(context);
    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Bearer token is required.',
        details: {},
      });
    }

    if (this.hasPermissions(request.user, requiredPermissions)) {
      return true;
    }

    const code = this.permissionDeniedCode(requiredPermissions);
    throw new ForbiddenException({
      code,
      message:
        'The authenticated user does not have permission for this route.',
      details: {
        requiredPermissions,
      },
    });
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private requiredPermissions(context: ExecutionContext): PermissionCode[] {
    return (
      this.reflector.getAllAndOverride<PermissionCode[]>(
        REQUIRED_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? []
    );
  }

  private hasPermissions(
    user: AuthenticatedUser,
    requiredPermissions: PermissionCode[],
  ): boolean {
    if (user.roles.includes(ROLE_CODES.admin)) {
      return true;
    }

    const grantedPermissions = new Set(user.permissions);
    return requiredPermissions.every((permission) =>
      grantedPermissions.has(permission),
    );
  }

  private permissionDeniedCode(requiredPermissions: PermissionCode[]): string {
    if (requiredPermissions.includes(PERMISSIONS.inventory.adjust)) {
      return 'INVENTORY_ADJUSTMENT_PERMISSION_DENIED';
    }
    return 'FORBIDDEN';
  }
}
