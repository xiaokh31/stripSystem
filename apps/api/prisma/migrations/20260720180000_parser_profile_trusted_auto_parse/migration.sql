-- PARSER-PROFILE-07: stable audit events for trusted automatic parsing and
-- server-side trust revocation after a material parser correction.

ALTER TYPE "ParserProfileAuditEventCode"
  ADD VALUE IF NOT EXISTS 'TRUSTED_AUTO_COMMITTED';

ALTER TYPE "ParserProfileAuditEventCode"
  ADD VALUE IF NOT EXISTS 'TRUSTED_AUTO_FALLBACK';

ALTER TYPE "ParserProfileAuditEventCode"
  ADD VALUE IF NOT EXISTS 'TRUST_REVOKED_BY_MATERIAL_CORRECTION';
