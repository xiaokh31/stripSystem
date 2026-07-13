import test from "node:test";
import assert from "node:assert/strict";
import {
  createUser,
  getOperationalSettings,
  getPalletPolicy,
  listPermissions,
  listRoles,
  listUsers,
  resetUserPassword,
  updateOperationalSettings,
  updateRolePermissions,
  updateUser,
  updateUserRoles,
  updateUserStatus,
  type PermissionResponse,
  type RoleResponse,
  type UserResponse,
} from "../src/lib/api-client";

const officeRole: RoleResponse = {
  id: "role-office",
  code: "OFFICE",
  displayName: "Office",
  description: "Office staff",
  isSystem: false,
  isActive: true,
  permissions: [],
  createdAt: "2026-06-29T10:00:00.000Z",
  updatedAt: "2026-06-29T10:00:00.000Z",
};

const user: UserResponse = {
  id: "user-1",
  email: "office@example.com",
  name: "Office User",
  isActive: true,
  lastLoginAt: null,
  roles: [
    {
      id: officeRole.id,
      code: officeRole.code,
      displayName: officeRole.displayName,
      permissions: ["imports.read"],
    },
  ],
  permissions: ["imports.read"],
  createdAt: "2026-06-29T10:00:00.000Z",
  updatedAt: "2026-06-29T10:00:00.000Z",
};

const permission: PermissionResponse = {
  id: "permission-users-manage",
  code: "users.manage",
  category: "users",
  description: "Manage users.",
  isSystem: true,
  createdAt: "2026-06-29T10:00:00.000Z",
  updatedAt: "2026-06-29T10:00:00.000Z",
};

test("admin API client reads users, roles, and permissions", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push(url);

    if (url.endsWith("/users")) {
      return jsonResponse({ items: [user] });
    }
    if (url.endsWith("/roles")) {
      return jsonResponse({ items: [officeRole] });
    }
    return jsonResponse({ items: [permission] });
  };

  const users = await listUsers({ baseUrl: "http://api.local/api", fetcher });
  const roles = await listRoles({ baseUrl: "http://api.local/api", fetcher });
  const permissions = await listPermissions({
    baseUrl: "http://api.local/api",
    fetcher,
  });

  assert.deepEqual(requests, [
    "http://api.local/api/users",
    "http://api.local/api/roles",
    "http://api.local/api/permissions",
  ]);
  assert.equal(users.items[0]?.email, "office@example.com");
  assert.equal(roles.items[0]?.code, "OFFICE");
  assert.equal(permissions.items[0]?.code, "users.manage");
});

test("admin API client sends user mutation payloads to real endpoints", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return jsonResponse({
      user,
      audit: {
        actorUserId: "admin-1",
        action: "users.update",
        targetUserId: user.id,
      },
    });
  };
  const options = { baseUrl: "http://api.local/api", fetcher };

  await createUser(
    {
      email: "warehouse@example.com",
      name: "Warehouse",
      password: "Password#123",
      roleCodes: ["WAREHOUSE"],
    },
    options,
  );
  await updateUser(user.id, { email: user.email ?? "", name: "Office" }, options);
  await updateUserRoles(user.id, { roleCodes: ["OFFICE", "WAREHOUSE"] }, options);
  await updateUserStatus(user.id, { isActive: false }, options);
  await resetUserPassword(user.id, { password: "NewPass#123" }, options);

  assert.deepEqual(requests, [
    {
      body: {
        email: "warehouse@example.com",
        name: "Warehouse",
        password: "Password#123",
        roleCodes: ["WAREHOUSE"],
      },
      method: "POST",
      url: "http://api.local/api/users",
    },
    {
      body: { email: "office@example.com", name: "Office" },
      method: "PATCH",
      url: "http://api.local/api/users/user-1",
    },
    {
      body: { roleCodes: ["OFFICE", "WAREHOUSE"] },
      method: "PATCH",
      url: "http://api.local/api/users/user-1/roles",
    },
    {
      body: { isActive: false },
      method: "PATCH",
      url: "http://api.local/api/users/user-1/status",
    },
    {
      body: { password: "NewPass#123" },
      method: "POST",
      url: "http://api.local/api/users/user-1/reset-password",
    },
  ]);
});

test("admin API client updates role permissions with permission codes", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return jsonResponse({
      role: {
        ...officeRole,
        permissions: [permission],
      },
      audit: {
        actorUserId: "admin-1",
        action: "roles.update_permissions",
        targetRoleId: officeRole.id,
      },
    });
  };

  await updateRolePermissions(
    officeRole.id,
    { permissionCodes: ["users.manage", "roles.manage"] },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    {
      body: { permissionCodes: ["users.manage", "roles.manage"] },
      method: "PATCH",
      url: "http://api.local/api/roles/role-office/permissions",
    },
  ]);
});

test("admin API client reads and updates operational settings", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const settings = {
    fields: [
      {
        key: "deliveryPhase",
        category: "Operational profile",
        label: "Delivery phase",
        description: "Current rollout stage.",
        inputType: "select",
        value: "P5 Pilot Ready",
        defaultValue: "P5 Pilot Ready",
        editable: true,
        options: [{ label: "Production", value: "Production" }],
        updatedAt: null,
        updatedById: null,
      },
    ],
    updatedAt: null,
  };
  const palletPolicy = {
    policyVersion: "pallet-footprint-v1",
    settingsRevision: "policy-revision",
    palletLengthM: "1.0",
    palletWidthM: "1.2",
    lowHeightM: "1.7",
    otherHeightM: "2.2",
    lowHeightCapacityCbm: "2.04",
    otherDestinationCapacityCbm: "2.64",
    yeg1ExtraPallets: 4,
    lowHeightDestinationCodes: ["YYC4", "YYC6", "YEG1", "YEG2"],
    otherDestinationAliases: ["YVR2", "UPS"],
    destinationAliasVersion: "destination-aliases-v1",
  };
  const fetcher: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
      method: init?.method ?? "GET",
      url,
    });
    if (url.endsWith("/settings/pallet-policy")) {
      return jsonResponse(palletPolicy);
    }
    return jsonResponse(
      init?.method === "PATCH"
        ? {
            settings,
            palletPolicy,
            audit: {
              actorUserId: "admin-1",
              action: "settings.update",
              changedKeys: ["deliveryPhase"],
            },
          }
        : settings,
    );
  };
  const options = { baseUrl: "http://api.local/api", fetcher };

  await getOperationalSettings(options);
  await getPalletPolicy(options);
  const mutation = await updateOperationalSettings(
    { values: { deliveryPhase: "Production" } },
    options,
  );
  assert.deepEqual(mutation.palletPolicy, palletPolicy);

  assert.deepEqual(requests, [
    {
      body: null,
      method: "GET",
      url: "http://api.local/api/settings/operational",
    },
    {
      body: null,
      method: "GET",
      url: "http://api.local/api/settings/pallet-policy",
    },
    {
      body: { values: { deliveryPhase: "Production" } },
      method: "PATCH",
      url: "http://api.local/api/settings/operational",
    },
  ]);
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
