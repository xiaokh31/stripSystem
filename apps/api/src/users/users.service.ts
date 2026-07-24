import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth-user';
import { ROLE_CODES, RoleCode } from '../auth/permissions';
import { PasswordService } from '../auth/password.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  UserListResponseDto,
  UserMutationResponseDto,
  UserResponseDto,
} from './dto/user-response.dto';

const USER_INCLUDE = {
  roleAssignments: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
};

type LegacyRoleCode =
  | typeof ROLE_CODES.admin
  | typeof ROLE_CODES.office
  | typeof ROLE_CODES.warehouse
  | typeof ROLE_CODES.system;

const LEGACY_ROLE_CODE_BY_ROLE_CODE: Record<RoleCode, LegacyRoleCode> = {
  [ROLE_CODES.admin]: ROLE_CODES.admin,
  [ROLE_CODES.hrManager]: ROLE_CODES.office,
  [ROLE_CODES.office]: ROLE_CODES.office,
  [ROLE_CODES.warehouse]: ROLE_CODES.warehouse,
  [ROLE_CODES.warehouseManager]: ROLE_CODES.warehouse,
  [ROLE_CODES.system]: ROLE_CODES.system,
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async listUsers(): Promise<UserListResponseDto> {
    const users = (await this.prisma.user.findMany({
      include: USER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })) as UserRecord[];

    return { items: users.map((user) => this.toUserResponse(user)) };
  }

  async getUser(id: string): Promise<UserResponseDto> {
    const user = await this.findUserOrThrow(id);
    return this.toUserResponse(user);
  }

  async createUser(
    dto: CreateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserMutationResponseDto> {
    const email = this.normalizeEmail(dto.email);
    await this.assertEmailAvailable(email);
    const roles = await this.resolveRoles(dto);
    const passwordHash = await this.passwordService.hashPassword(dto.password);

    const user = (await this.prisma.user.create({
      data: {
        email,
        name: dto.name ?? null,
        passwordHash,
        role: this.legacyRoleFor(roles),
        roleAssignments: {
          create: roles.map((role) => ({
            roleId: role.id,
            assignedById: actor.id,
          })),
        },
      },
      include: USER_INCLUDE,
    })) as UserRecord;

    this.audit(actor, 'users.create', user.id, {
      email,
      roleCodes: roles.map((role) => role.code),
    });
    return this.mutationResponse(user, actor, 'users.create');
  }

  async updateUser(
    id: string,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserMutationResponseDto> {
    await this.findUserOrThrow(id);
    const data: Record<string, string | null> = {};

    if (dto.email !== undefined) {
      const email = this.normalizeEmail(dto.email);
      await this.assertEmailAvailable(email, id);
      data.email = email;
    }
    if (dto.name !== undefined) {
      data.name = dto.name ?? null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'USER_UPDATE_REQUIRED',
        message: 'At least one user field must be provided.',
        details: {},
      });
    }

    const user = (await this.prisma.user.update({
      where: { id },
      data,
      include: USER_INCLUDE,
    })) as UserRecord;

    this.audit(actor, 'users.update', id, { fields: Object.keys(data) });
    return this.mutationResponse(user, actor, 'users.update');
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    actor: AuthenticatedUser,
  ): Promise<UserMutationResponseDto> {
    await this.findUserOrThrow(id);
    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const user = (await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { passwordHash },
        include: USER_INCLUDE,
      });
      await this.revokeActiveSessions(tx, id, actor.id, 'PASSWORD_RESET');
      return updated;
    })) as UserRecord;

    this.audit(actor, 'users.reset_password', id, {});
    return this.mutationResponse(user, actor, 'users.reset_password');
  }

  async updateRoles(
    id: string,
    dto: UpdateUserRolesDto,
    actor: AuthenticatedUser,
  ): Promise<UserMutationResponseDto> {
    await this.findUserOrThrow(id);
    const roles = await this.resolveRoles(dto);

    const user = (await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.deleteMany({ where: { userId: id } });
      return tx.user.update({
        where: { id },
        data: {
          role: this.legacyRoleFor(roles),
          roleAssignments: {
            create: roles.map((role) => ({
              roleId: role.id,
              assignedById: actor.id,
            })),
          },
        },
        include: USER_INCLUDE,
      });
    })) as UserRecord;

    this.audit(actor, 'users.update_roles', id, {
      roleCodes: roles.map((role) => role.code),
    });
    return this.mutationResponse(user, actor, 'users.update_roles');
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    actor: AuthenticatedUser,
  ): Promise<UserMutationResponseDto> {
    await this.findUserOrThrow(id);
    const user = (await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { isActive: dto.isActive },
        include: USER_INCLUDE,
      });
      if (!dto.isActive) {
        await this.revokeActiveSessions(tx, id, actor.id, 'USER_INACTIVE');
      }
      return updated;
    })) as UserRecord;

    this.audit(actor, 'users.update_status', id, {
      isActive: dto.isActive,
    });
    return this.mutationResponse(user, actor, 'users.update_status');
  }

  private async revokeActiveSessions(
    tx: Prisma.TransactionClient,
    userId: string,
    actorUserId: string,
    reason: string,
  ): Promise<void> {
    const sessions = await tx.nativeAuthSession.findMany({
      where: { revokedAt: null, userId },
      select: { id: true },
    });
    if (sessions.length === 0) return;
    const sessionIds = sessions.map(({ id }) => id);
    const revokedAt = new Date();
    await tx.nativeAuthSession.updateMany({
      where: { id: { in: sessionIds }, revokedAt: null },
      data: { revokeReason: reason, revokedAt, revokedByUserId: actorUserId },
    });
    await tx.nativeRefreshToken.updateMany({
      where: { revokedAt: null, sessionId: { in: sessionIds } },
      data: { revokedAt },
    });
  }

  private async findUserOrThrow(id: string): Promise<UserRecord> {
    const user = (await this.prisma.user.findUnique({
      where: { id },
      include: USER_INCLUDE,
    })) as UserRecord | null;
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User ${id} was not found.`,
        details: { id },
      });
    }
    return user;
  }

  private async assertEmailAvailable(
    email: string,
    currentUserId?: string,
  ): Promise<void> {
    const existing = (await this.prisma.user.findUnique({
      where: { email },
    })) as { id: string } | null;
    if (existing && existing.id !== currentUserId) {
      throw new ConflictException({
        code: 'USER_EMAIL_ALREADY_EXISTS',
        message: `User email ${email} already exists.`,
        details: { email },
      });
    }
  }

  private async resolveRoles(dto: RoleInput): Promise<RoleRecord[]> {
    const roleIds = uniqueValues(dto.roleIds ?? []);
    const roleCodes = uniqueValues(dto.roleCodes ?? []).map((code) =>
      code.trim().toUpperCase(),
    );
    if (roleIds.length === 0 && roleCodes.length === 0) {
      throw new BadRequestException({
        code: 'USER_ROLE_REQUIRED',
        message: 'At least one role id or role code is required.',
        details: {},
      });
    }

    const or = [
      ...(roleIds.length > 0 ? [{ id: { in: roleIds } }] : []),
      ...(roleCodes.length > 0 ? [{ code: { in: roleCodes } }] : []),
    ];
    const roles = (await this.prisma.role.findMany({
      where: { OR: or },
      orderBy: { code: 'asc' },
    })) as RoleRecord[];
    const matchedIds = new Set(roles.map((role) => role.id));
    const matchedCodes = new Set(roles.map((role) => role.code));
    const missingRoleIds = roleIds.filter((id) => !matchedIds.has(id));
    const missingRoleCodes = roleCodes.filter(
      (code) => !matchedCodes.has(code),
    );
    if (missingRoleIds.length > 0 || missingRoleCodes.length > 0) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'One or more requested roles were not found.',
        details: {
          missingRoleIds,
          missingRoleCodes,
        },
      });
    }

    return [...new Map(roles.map((role) => [role.id, role])).values()];
  }

  private legacyRoleFor(roles: RoleRecord[]): LegacyRoleCode {
    const firstMappedRoleCode = roles
      .map((role) => role.code)
      .find(isKnownRoleCode);
    return firstMappedRoleCode
      ? LEGACY_ROLE_CODE_BY_ROLE_CODE[firstMappedRoleCode]
      : ROLE_CODES.office;
  }

  private toUserResponse(user: UserRecord): UserResponseDto {
    const roles = user.roleAssignments
      .filter((assignment) => assignment.role.isActive)
      .map((assignment) => ({
        id: assignment.role.id,
        code: assignment.role.code,
        displayName: assignment.role.displayName,
        permissions: assignment.role.permissions
          .map((item) => item.permission.code)
          .sort(),
      }))
      .sort((left, right) => left.code.localeCompare(right.code));
    const permissions = roles.flatMap((role) => role.permissions);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      lastLoginAt: toIsoOrNull(user.lastLoginAt),
      roles,
      permissions: [...new Set(permissions)].sort(),
      createdAt: toIso(user.createdAt),
      updatedAt: toIso(user.updatedAt),
    };
  }

  private mutationResponse(
    user: UserRecord,
    actor: AuthenticatedUser,
    action: string,
  ): UserMutationResponseDto {
    return {
      user: this.toUserResponse(user),
      audit: {
        actorUserId: actor.id,
        action,
        targetUserId: user.id,
      },
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private audit(
    actor: AuthenticatedUser,
    action: string,
    targetUserId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.logger.log(
      JSON.stringify({
        scope: 'user-management',
        action,
        actorUserId: actor.id,
        targetUserId,
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

function toIsoOrNull(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  return toIso(value);
}

interface RoleInput {
  roleIds?: string[];
  roleCodes?: string[];
}

interface RoleRecord {
  id: string;
  code: string;
  displayName: string;
}

interface UserRecord {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | string | null;
  roleAssignments: Array<{
    role: {
      id: string;
      code: string;
      displayName: string;
      isActive: boolean;
      permissions: Array<{
        permission: {
          code: string;
        };
      }>;
    };
  }>;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function isKnownRoleCode(value: string): value is RoleCode {
  return (Object.values(ROLE_CODES) as string[]).includes(value);
}
