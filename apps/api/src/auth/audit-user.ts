import { AuthenticatedUser } from './auth-user';
import { ROLE_CODES } from './permissions';

export function auditUserId(
  actor: AuthenticatedUser,
  requestedUserId?: string | null,
): string {
  const requested = normalizedUserId(requestedUserId);
  if (requested && canOverrideAuditUser(actor)) {
    return requested;
  }

  return actor.id;
}

export function isAuditUserOverride(
  actor: AuthenticatedUser,
  requestedUserId?: string | null,
): boolean {
  const requested = normalizedUserId(requestedUserId);
  return Boolean(
    requested && requested !== actor.id && canOverrideAuditUser(actor),
  );
}

export function canOverrideAuditUser(actor: AuthenticatedUser): boolean {
  return actor.roles.some(
    (role) => role === ROLE_CODES.admin || role === ROLE_CODES.system,
  );
}

function normalizedUserId(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
