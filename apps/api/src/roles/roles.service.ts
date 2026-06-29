import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import {
  PermissionListResponseDto,
  PermissionResponseDto,
  RoleListResponseDto,
  RoleMutationResponseDto,
  RoleResponseDto,
} from './dto/role-response.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const ROLE_INCLUDE = {
  permissions: {
    include: {
      permission: true,
    },
  },
};

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listRoles(): Promise<RoleListResponseDto> {
    const roles = (await this.prisma.role.findMany({
      include: ROLE_INCLUDE,
      orderBy: { code: 'asc' },
    })) as RoleRecord[];

    return { items: roles.map((role) => this.toRoleResponse(role)) };
  }

  async createRole(
    dto: CreateRoleDto,
    actor: AuthenticatedUser,
  ): Promise<RoleMutationResponseDto> {
    const code = this.normalizeRoleCode(dto.code);
    await this.assertRoleCodeAvailable(code);
    const role = (await this.prisma.role.create({
      data: {
        code,
        displayName: dto.displayName,
        description: dto.description ?? null,
        isSystem: dto.isSystem ?? false,
        isActive: dto.isActive ?? true,
      },
      include: ROLE_INCLUDE,
    })) as RoleRecord;

    this.audit(actor, 'roles.create', role.id, { code });
    return this.mutationResponse(role, actor, 'roles.create');
  }

  async getRole(id: string): Promise<RoleResponseDto> {
    const role = await this.findRoleOrThrow(id);
    return this.toRoleResponse(role);
  }

  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    actor: AuthenticatedUser,
  ): Promise<RoleMutationResponseDto> {
    await this.findRoleOrThrow(id);
    const data: Record<string, string | boolean | null> = {};
    if (dto.displayName !== undefined) {
      data.displayName = dto.displayName;
    }
    if (dto.description !== undefined) {
      data.description = dto.description ?? null;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'ROLE_UPDATE_REQUIRED',
        message: 'At least one role field must be provided.',
        details: {},
      });
    }

    const role = (await this.prisma.role.update({
      where: { id },
      data,
      include: ROLE_INCLUDE,
    })) as RoleRecord;

    this.audit(actor, 'roles.update', id, { fields: Object.keys(data) });
    return this.mutationResponse(role, actor, 'roles.update');
  }

  async updateRolePermissions(
    id: string,
    dto: UpdateRolePermissionsDto,
    actor: AuthenticatedUser,
  ): Promise<RoleMutationResponseDto> {
    await this.findRoleOrThrow(id);
    const permissions = await this.resolvePermissions(dto);

    const role = (await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      return tx.role.update({
        where: { id },
        data: {
          permissions: {
            create: permissions.map((permission) => ({
              permissionId: permission.id,
            })),
          },
        },
        include: ROLE_INCLUDE,
      });
    })) as RoleRecord;

    this.audit(actor, 'roles.update_permissions', id, {
      permissionCodes: permissions.map((permission) => permission.code),
    });
    return this.mutationResponse(role, actor, 'roles.update_permissions');
  }

  async listPermissions(): Promise<PermissionListResponseDto> {
    const permissions = (await this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    })) as PermissionRecord[];
    return {
      items: permissions.map((item) => this.toPermissionResponse(item)),
    };
  }

  private async findRoleOrThrow(id: string): Promise<RoleRecord> {
    const role = (await this.prisma.role.findUnique({
      where: { id },
      include: ROLE_INCLUDE,
    })) as RoleRecord | null;
    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `Role ${id} was not found.`,
        details: { id },
      });
    }
    return role;
  }

  private async assertRoleCodeAvailable(code: string): Promise<void> {
    const existing = (await this.prisma.role.findUnique({
      where: { code },
    })) as { id: string } | null;
    if (existing) {
      throw new ConflictException({
        code: 'ROLE_CODE_ALREADY_EXISTS',
        message: `Role code ${code} already exists.`,
        details: { code },
      });
    }
  }

  private async resolvePermissions(
    dto: UpdateRolePermissionsDto,
  ): Promise<PermissionRecord[]> {
    const permissionIds = uniqueValues(dto.permissionIds ?? []);
    const permissionCodes = uniqueValues(dto.permissionCodes ?? []);
    if (dto.permissionIds === undefined && dto.permissionCodes === undefined) {
      throw new BadRequestException({
        code: 'ROLE_PERMISSIONS_REQUIRED',
        message: 'permissionIds or permissionCodes must be provided.',
        details: {},
      });
    }
    if (permissionIds.length === 0 && permissionCodes.length === 0) {
      return [];
    }

    const or = [
      ...(permissionIds.length > 0 ? [{ id: { in: permissionIds } }] : []),
      ...(permissionCodes.length > 0
        ? [{ code: { in: permissionCodes } }]
        : []),
    ];
    const permissions = (await this.prisma.permission.findMany({
      where: { OR: or },
      orderBy: { code: 'asc' },
    })) as PermissionRecord[];
    const matchedIds = new Set(permissions.map((permission) => permission.id));
    const matchedCodes = new Set(
      permissions.map((permission) => permission.code),
    );
    const missingPermissionIds = permissionIds.filter(
      (id) => !matchedIds.has(id),
    );
    const missingPermissionCodes = permissionCodes.filter(
      (code) => !matchedCodes.has(code),
    );
    if (missingPermissionIds.length > 0 || missingPermissionCodes.length > 0) {
      throw new NotFoundException({
        code: 'PERMISSION_NOT_FOUND',
        message: 'One or more requested permissions were not found.',
        details: {
          missingPermissionIds,
          missingPermissionCodes,
        },
      });
    }

    return [
      ...new Map(
        permissions.map((permission) => [permission.id, permission]),
      ).values(),
    ];
  }

  private toRoleResponse(role: RoleRecord): RoleResponseDto {
    return {
      id: role.id,
      code: role.code,
      displayName: role.displayName,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      permissions: role.permissions
        .map((item) => this.toPermissionResponse(item.permission))
        .sort((left, right) => left.code.localeCompare(right.code)),
      createdAt: toIso(role.createdAt),
      updatedAt: toIso(role.updatedAt),
    };
  }

  private toPermissionResponse(
    permission: PermissionRecord,
  ): PermissionResponseDto {
    return {
      id: permission.id,
      code: permission.code,
      category: permission.category,
      description: permission.description,
      isSystem: permission.isSystem,
      createdAt: toIso(permission.createdAt),
      updatedAt: toIso(permission.updatedAt),
    };
  }

  private mutationResponse(
    role: RoleRecord,
    actor: AuthenticatedUser,
    action: string,
  ): RoleMutationResponseDto {
    return {
      role: this.toRoleResponse(role),
      audit: {
        actorUserId: actor.id,
        action,
        targetRoleId: role.id,
      },
    };
  }

  private normalizeRoleCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private audit(
    actor: AuthenticatedUser,
    action: string,
    targetRoleId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.logger.log(
      JSON.stringify({
        scope: 'role-management',
        action,
        actorUserId: actor.id,
        targetRoleId,
        metadata,
      }),
    );
  }
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

interface RoleRecord {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: Array<{
    permission: PermissionRecord;
  }>;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface PermissionRecord {
  id: string;
  code: string;
  category: string | null;
  description: string | null;
  isSystem: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}
