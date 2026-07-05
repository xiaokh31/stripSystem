import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthTokenService } from './../src/auth/auth-token.service';
import { DEFAULT_ROLE_PERMISSION_CODES } from './../src/auth/default-rbac';
import { ROLE_CODES, RoleCode } from './../src/auth/permissions';

export const TEST_JWT_SECRET = 'e2e-test-secret';

export const authTestUsers = {
  admin: authUser('auth-admin', 'admin@example.com', ROLE_CODES.admin),
  hrManager: authUser(
    'auth-hr-manager',
    'hr-manager@example.com',
    ROLE_CODES.hrManager,
  ),
  office: authUser('auth-office', 'office@example.com', ROLE_CODES.office),
  warehouse: authUser(
    'auth-warehouse',
    'warehouse@example.com',
    ROLE_CODES.warehouse,
  ),
  warehouseManager: authUser(
    'auth-warehouse-manager',
    'warehouse-manager@example.com',
    ROLE_CODES.warehouseManager,
  ),
  inactive: {
    ...authUser('auth-inactive', 'inactive@example.com', ROLE_CODES.office),
    isActive: false,
  },
};

export function configureAuthTestEnv(): void {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.JWT_EXPIRES_IN_SECONDS = '900';
}

export function installAuthMock(
  prisma: Record<string, unknown>,
  users: AuthTestUser[] = Object.values(authTestUsers),
): void {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const usersByEmail = new Map(users.map((user) => [user.email, user]));
  const existingUserModel =
    typeof prisma.user === 'object' && prisma.user !== null ? prisma.user : {};
  const existingFindUnique = hasUserFindUnique(existingUserModel)
    ? existingUserModel.findUnique
    : undefined;
  const existingUpdate = hasUserUpdate(existingUserModel)
    ? existingUserModel.update
    : undefined;

  prisma.user = {
    ...existingUserModel,
    findUnique: async (args: UserFindUniqueArgs) => {
      const { where } = args;
      if (where.id) {
        const user = usersById.get(where.id);
        if (user) {
          return user;
        }
      }
      if (where.email) {
        const user = usersByEmail.get(where.email);
        if (user) {
          return user;
        }
      }
      return existingFindUnique ? existingFindUnique(args) : null;
    },
    update: async (args: UserUpdateArgs) => {
      const { where, data } = args;
      const user = usersById.get(where.id);
      if (!user) {
        return existingUpdate ? existingUpdate(args) : null;
      }
      Object.assign(user, data);
      return user;
    },
  };
}

export function adminAuthHeader(): string {
  return authHeaderFor(authTestUsers.admin);
}

export function officeAuthHeader(): string {
  return authHeaderFor(authTestUsers.office);
}

export function hrManagerAuthHeader(): string {
  return authHeaderFor(authTestUsers.hrManager);
}

export function warehouseAuthHeader(): string {
  return authHeaderFor(authTestUsers.warehouse);
}

export function warehouseManagerAuthHeader(): string {
  return authHeaderFor(authTestUsers.warehouseManager);
}

export function inactiveAuthHeader(): string {
  return authHeaderFor(authTestUsers.inactive);
}

export function authHeaderFor(user: AuthTestUser): string {
  const tokenService = new AuthTokenService(configService());
  const { accessToken } = tokenService.sign({
    sub: user.id,
    email: user.email,
    roles: user.roleAssignments.map((assignment) => assignment.role.code),
  });
  return `Bearer ${accessToken}`;
}

export function authorizedRequest(
  app: INestApplication,
  authorization = adminAuthHeader(),
) {
  const server = app.getHttpServer();
  return {
    get: (url: string) =>
      request(server).get(url).set('Authorization', authorization),
    post: (url: string) =>
      request(server).post(url).set('Authorization', authorization),
    patch: (url: string) =>
      request(server).patch(url).set('Authorization', authorization),
    delete: (url: string) =>
      request(server).delete(url).set('Authorization', authorization),
  };
}

function authUser(
  id: string,
  email: string,
  roleCode: RoleCode,
  permissions = DEFAULT_ROLE_PERMISSION_CODES[roleCode],
): AuthTestUser {
  return {
    id,
    email,
    name: `${roleCode} User`,
    role: roleCode,
    isActive: true,
    roleAssignments: [
      {
        role: {
          code: roleCode,
          isActive: true,
          permissions: permissions.map((code) => ({
            permission: { code },
          })),
        },
      },
    ],
  };
}

function configService(): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'app.jwtSecret') {
        return TEST_JWT_SECRET;
      }
      if (key === 'app.jwtExpiresInSeconds') {
        return 900;
      }
      return undefined;
    },
  } as unknown as ConfigService;
}

export interface AuthTestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  roleAssignments: Array<{
    role: {
      code: string;
      isActive: boolean;
      permissions: Array<{
        permission: {
          code: string;
        };
      }>;
    };
  }>;
}

interface UserFindUniqueArgs {
  where: {
    id?: string;
    email?: string;
  };
}

interface UserUpdateArgs {
  where: {
    id: string;
  };
  data: Partial<AuthTestUser>;
}

function hasUserFindUnique(value: unknown): value is {
  findUnique: (args: UserFindUniqueArgs) => Promise<unknown>;
} {
  return (
    value !== null &&
    typeof value === 'object' &&
    'findUnique' in value &&
    typeof value.findUnique === 'function'
  );
}

function hasUserUpdate(value: unknown): value is {
  update: (args: UserUpdateArgs) => Promise<unknown>;
} {
  return (
    value !== null &&
    typeof value === 'object' &&
    'update' in value &&
    typeof value.update === 'function'
  );
}
