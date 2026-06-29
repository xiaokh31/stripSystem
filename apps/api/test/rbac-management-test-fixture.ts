import { PasswordService } from './../src/auth/password.service';

const NOW = new Date('2026-06-29T12:00:00.000Z');

export async function createRbacManagementPrismaMock() {
  const passwordService = new PasswordService();
  const permissions: PermissionRecord[] = [
    permission('permission-imports-read', 'imports.read', 'imports'),
    permission('permission-reports-generate', 'reports.generate', 'reports'),
    permission('permission-users-manage', 'users.manage', 'users'),
    permission('permission-roles-manage', 'roles.manage', 'roles'),
    permission('permission-load-jobs-read', 'load_jobs.read', 'load_jobs'),
  ];
  const roles: RoleRecord[] = [
    role('role-admin', 'ADMIN', 'Administrator'),
    role('role-office', 'OFFICE', 'Office Staff'),
    role('role-warehouse', 'WAREHOUSE', 'Warehouse Staff'),
    role('role-system', 'SYSTEM', 'System Service'),
  ];
  const rolePermissions: RolePermissionRecord[] = [
    rolePermission(
      'role-permission-office-imports',
      'role-office',
      'permission-imports-read',
    ),
    rolePermission(
      'role-permission-admin-users',
      'role-admin',
      'permission-users-manage',
    ),
    rolePermission(
      'role-permission-admin-roles',
      'role-admin',
      'permission-roles-manage',
    ),
    rolePermission(
      'role-permission-warehouse-load-jobs',
      'role-warehouse',
      'permission-load-jobs-read',
    ),
  ];
  const users: UserRecord[] = [];
  const userRoleAssignments: UserRoleAssignmentRecord[] = [];

  const mock: any = {
    checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
    $transaction: jest.fn((callback) => callback(mock)),
    permission: {
      findMany: jest.fn(({ where, orderBy } = {}) =>
        Promise.resolve(
          sortPermissions(
            permissions.filter((record) =>
              matchesPermissionWhere(record, where),
            ),
            orderBy,
          ),
        ),
      ),
    },
    role: {
      findMany: jest.fn(({ where, orderBy, include } = {}) =>
        Promise.resolve(
          sortRoles(
            roles.filter((record) => matchesRoleWhere(record, where)),
            orderBy,
          ).map((record) => (include ? hydrateRole(record) : record)),
        ),
      ),
      findUnique: jest.fn(({ where, include }) => {
        const found =
          roles.find((record) =>
            where.id ? record.id === where.id : record.code === where.code,
          ) ?? null;
        return Promise.resolve(found && include ? hydrateRole(found) : found);
      }),
      create: jest.fn(({ data, include }) => {
        const created = role(
          `role-${data.code.toLowerCase()}`,
          data.code,
          data.displayName,
          data.description ?? null,
          data.isSystem ?? false,
          data.isActive ?? true,
        );
        roles.push(created);
        return Promise.resolve(include ? hydrateRole(created) : created);
      }),
      update: jest.fn(({ where, data, include }) => {
        const found = roles.find((record) => record.id === where.id);
        if (!found) {
          throw new Error(`Role not found: ${where.id}`);
        }
        const { permissions: nestedPermissions, ...roleData } = data;
        Object.assign(found, roleData, { updatedAt: NOW });
        for (const nested of nestedPermissions?.create ?? []) {
          rolePermissions.push(
            rolePermission(
              `role-permission-${rolePermissions.length + 1}`,
              found.id,
              nested.permissionId,
            ),
          );
        }
        return Promise.resolve(include ? hydrateRole(found) : found);
      }),
    },
    rolePermission: {
      deleteMany: jest.fn(({ where }) => {
        deleteWhere(rolePermissions, (item) => item.roleId === where.roleId);
        return Promise.resolve({ count: 0 });
      }),
    },
    userRoleAssignment: {
      deleteMany: jest.fn(({ where }) => {
        deleteWhere(
          userRoleAssignments,
          (item) => item.userId === where.userId,
        );
        return Promise.resolve({ count: 0 });
      }),
    },
    user: {
      findMany: jest.fn(({ include, orderBy } = {}) =>
        Promise.resolve(
          sortUsers(users, orderBy).map((record) =>
            include ? hydrateUser(record) : record,
          ),
        ),
      ),
      findUnique: jest.fn(({ where, include }) => {
        const found =
          users.find((record) =>
            where.id ? record.id === where.id : record.email === where.email,
          ) ?? null;
        return Promise.resolve(found && include ? hydrateUser(found) : found);
      }),
      create: jest.fn(({ data, include }) => {
        const created: UserRecord = {
          id: `user-${users.length + 1}`,
          email: data.email,
          name: data.name ?? null,
          passwordHash: data.passwordHash,
          role: data.role,
          isActive: true,
          lastLoginAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        };
        users.push(created);
        for (const assignment of data.roleAssignments?.create ?? []) {
          userRoleAssignments.push(
            userRoleAssignment(
              `user-role-${userRoleAssignments.length + 1}`,
              created.id,
              assignment.roleId,
              assignment.assignedById ?? null,
            ),
          );
        }
        return Promise.resolve(include ? hydrateUser(created) : created);
      }),
      update: jest.fn(({ where, data, include }) => {
        const found = users.find((record) => record.id === where.id);
        if (!found) {
          throw new Error(`User not found: ${where.id}`);
        }
        const { roleAssignments: nestedRoles, ...userData } = data;
        Object.assign(found, userData, { updatedAt: NOW });
        for (const assignment of nestedRoles?.create ?? []) {
          userRoleAssignments.push(
            userRoleAssignment(
              `user-role-${userRoleAssignments.length + 1}`,
              found.id,
              assignment.roleId,
              assignment.assignedById ?? null,
            ),
          );
        }
        return Promise.resolve(include ? hydrateUser(found) : found);
      }),
    },
  };

  return {
    prisma: mock,
    roles,
    permissions,
    users,
    userRoleAssignments,
    rolePermissions,
    passwordService,
  };

  function hydrateUser(record: UserRecord) {
    return {
      ...record,
      roleAssignments: userRoleAssignments
        .filter((assignment) => assignment.userId === record.id)
        .map((assignment) => ({
          ...assignment,
          role: hydrateRole(
            roles.find((item) => item.id === assignment.roleId)!,
          ),
        })),
    };
  }

  function hydrateRole(record: RoleRecord) {
    return {
      ...record,
      permissions: rolePermissions
        .filter((assignment) => assignment.roleId === record.id)
        .map((assignment) => ({
          ...assignment,
          permission: permissions.find(
            (item) => item.id === assignment.permissionId,
          )!,
        })),
    };
  }
}

function permission(
  id: string,
  code: string,
  category: string,
): PermissionRecord {
  return {
    id,
    code,
    category,
    description: `${code} permission`,
    isSystem: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function role(
  id: string,
  code: string,
  displayName: string,
  description: string | null = null,
  isSystem = false,
  isActive = true,
): RoleRecord {
  return {
    id,
    code,
    displayName,
    description,
    isSystem,
    isActive,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function rolePermission(
  id: string,
  roleId: string,
  permissionId: string,
): RolePermissionRecord {
  return {
    id,
    roleId,
    permissionId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function userRoleAssignment(
  id: string,
  userId: string,
  roleId: string,
  assignedById: string | null,
): UserRoleAssignmentRecord {
  return {
    id,
    userId,
    roleId,
    assignedById,
    assignedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function matchesRoleWhere(record: RoleRecord, where: any): boolean {
  if (!where) {
    return true;
  }
  if (where.OR) {
    return where.OR.some((condition: any) =>
      matchesRoleWhere(record, condition),
    );
  }
  if (where.id?.in) {
    return where.id.in.includes(record.id);
  }
  if (where.code?.in) {
    return where.code.in.includes(record.code);
  }
  if (where.id) {
    return record.id === where.id;
  }
  if (where.code) {
    return record.code === where.code;
  }
  return true;
}

function matchesPermissionWhere(record: PermissionRecord, where: any): boolean {
  if (!where) {
    return true;
  }
  if (where.OR) {
    return where.OR.some((condition: any) =>
      matchesPermissionWhere(record, condition),
    );
  }
  if (where.id?.in) {
    return where.id.in.includes(record.id);
  }
  if (where.code?.in) {
    return where.code.in.includes(record.code);
  }
  return true;
}

function sortRoles(records: RoleRecord[], orderBy: any): RoleRecord[] {
  if (orderBy?.code === 'asc') {
    return [...records].sort((left, right) =>
      left.code.localeCompare(right.code),
    );
  }
  return records;
}

function sortPermissions(
  records: PermissionRecord[],
  orderBy: any,
): PermissionRecord[] {
  if (Array.isArray(orderBy)) {
    return [...records].sort((left, right) => {
      const categoryDelta = (left.category ?? '').localeCompare(
        right.category ?? '',
      );
      return categoryDelta || left.code.localeCompare(right.code);
    });
  }
  if (orderBy?.code === 'asc') {
    return [...records].sort((left, right) =>
      left.code.localeCompare(right.code),
    );
  }
  return records;
}

function sortUsers(records: UserRecord[], orderBy: any): UserRecord[] {
  if (orderBy?.createdAt === 'desc') {
    return [...records].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
  }
  return records;
}

function deleteWhere<T>(records: T[], predicate: (record: T) => boolean): void {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (predicate(records[index])) {
      records.splice(index, 1);
    }
  }
}

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleRecord {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermissionRecord {
  id: string;
  code: string;
  category: string;
  description: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RolePermissionRecord {
  id: string;
  roleId: string;
  permissionId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRoleAssignmentRecord {
  id: string;
  userId: string;
  roleId: string;
  assignedById: string | null;
  assignedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
