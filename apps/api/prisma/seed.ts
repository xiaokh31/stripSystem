import { createHash } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { DEFAULT_DATABASE_URL } from '../src/config/app.config';
import {
  DefaultRole,
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLE_PERMISSION_CODES,
  DEFAULT_ROLES,
} from '../src/auth/default-rbac';
import { PasswordService } from '../src/auth/password.service';
import { PASSWORD_MIN_LENGTH } from '../src/auth/password-policy';
import { ROLE_CODES } from '../src/auth/permissions';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
});

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedPermissions(client);
    await seedRoles(client);
    await seedRolePermissions(client);
    await seedInitialAdmin(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function seedPermissions(client: PoolClient): Promise<void> {
  for (const permission of DEFAULT_PERMISSIONS) {
    await client.query(
      `
        INSERT INTO permissions (id, code, category, description, is_system, updated_at)
        VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
        ON CONFLICT (code) DO UPDATE
        SET category = EXCLUDED.category,
            description = EXCLUDED.description,
            is_system = true,
            updated_at = CURRENT_TIMESTAMP
      `,
      [
        stableId('permission', permission.code),
        permission.code,
        permission.category,
        permission.description,
      ],
    );
  }
}

async function seedRoles(client: PoolClient): Promise<void> {
  for (const role of DEFAULT_ROLES) {
    await upsertRole(client, role);
  }
}

async function upsertRole(
  client: PoolClient,
  role: DefaultRole,
): Promise<void> {
  await client.query(
    `
      INSERT INTO roles (id, code, display_name, description, is_system, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
      ON CONFLICT (code) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          is_system = EXCLUDED.is_system,
          is_active = true,
          updated_at = CURRENT_TIMESTAMP
    `,
    [
      stableId('role', role.code),
      role.code,
      role.displayName,
      role.description,
      role.isSystem,
    ],
  );
}

async function seedRolePermissions(client: PoolClient): Promise<void> {
  for (const roleCode of Object.values(ROLE_CODES)) {
    const permissionCodes = DEFAULT_ROLE_PERMISSION_CODES[roleCode];
    const role = await findIdByCode(client, 'roles', roleCode);
    if (!role) {
      throw new Error(`Default role ${roleCode} was not seeded.`);
    }

    const permissions = await findPermissionIds(client, permissionCodes);
    const foundCodes = new Set(
      permissions.map((permission) => permission.code),
    );
    const missingCodes = permissionCodes.filter(
      (code) => !foundCodes.has(code),
    );
    if (missingCodes.length > 0) {
      throw new Error(
        `Default permissions missing for ${roleCode}: ${missingCodes.join(', ')}`,
      );
    }

    const expectedPermissionIds = new Set(
      permissions.map((permission) => permission.id),
    );
    await client.query(
      `
        DELETE FROM role_permissions
        WHERE role_id = $1
          AND NOT (permission_id = ANY($2::text[]))
      `,
      [role.id, [...expectedPermissionIds]],
    );

    for (const permission of permissions) {
      await client.query(
        `
          INSERT INTO role_permissions (id, role_id, permission_id, updated_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          ON CONFLICT (role_id, permission_id) DO NOTHING
        `,
        [
          stableId('role_permission', `${role.id}:${permission.id}`),
          role.id,
          permission.id,
        ],
      );
    }
  }
}

async function seedInitialAdmin(client: PoolClient): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Initial Administrator';

  if (!email && !password) {
    return;
  }
  if (!email || !password) {
    throw new Error(
      'Both SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required to create the initial administrator.',
    );
  }
  assertSeedPassword(password);

  const adminRole = await findIdByCode(client, 'roles', ROLE_CODES.admin);
  if (!adminRole) {
    throw new Error('ADMIN role was not seeded.');
  }

  const passwordHash = await new PasswordService().hashPassword(password);
  const user = await client.query<{ id: string }>(
    `
      INSERT INTO users (id, email, name, password_hash, role, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5::"UserRole", true, CURRENT_TIMESTAMP)
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          is_active = true,
          updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `,
    [
      stableId('user', `admin:${email}`),
      email,
      name,
      passwordHash,
      ROLE_CODES.admin,
    ],
  );

  await client.query(
    `
      INSERT INTO user_roles (id, user_id, role_id, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [
      stableId('user_role', `${user.rows[0].id}:${adminRole.id}`),
      user.rows[0].id,
      adminRole.id,
    ],
  );
}

function assertSeedPassword(password: string): void {
  const weakPasswordNames = new Set([
    'admin',
    'password',
    'bestar',
    'changeme',
    'change-me',
    'default',
  ]);
  const normalized = password.trim().toLowerCase();
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    weakPasswordNames.has(normalized)
  ) {
    throw new Error(
      `SEED_ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters and must not use a common default password.`,
    );
  }
}

async function findIdByCode(
  client: PoolClient,
  table: 'roles' | 'permissions',
  code: string,
): Promise<{ id: string } | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE code = $1`,
    [code],
  );
  return result.rows[0] ?? null;
}

async function findPermissionIds(
  client: PoolClient,
  codes: readonly string[],
): Promise<Array<{ id: string; code: string }>> {
  const result = await client.query<{ id: string; code: string }>(
    `
      SELECT id, code
      FROM permissions
      WHERE code = ANY($1::text[])
      ORDER BY code ASC
    `,
    [codes],
  );
  return result.rows;
}

function stableId(prefix: string, value: string): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 24);
  return `${prefix}_${digest}`;
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
