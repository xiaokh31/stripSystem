# PARSER-PROFILE-01 Foundation Verification

## Result

`PARSER-PROFILE-01` establishes the repository and database foundation for
adaptive parser profiles without implementing fingerprint matching, mapping
execution, approval UI, or trusted automatic parsing from later Tasks.

Delivered:
- immutable profile family/version and source-snapshot schema, learning cases,
  evidence, audit events, parser source identity, lifecycle/trust enums, and
  three additive migrations;
- formal, concurrency-safe failed-import to manual-container linkage;
- authenticated learning-case start/read/link/unlink/close APIs and optional
  transactional `learningCaseId` on manual container creation;
- restrictive deletion and an API blocker that runs before storage cleanup;
- exact default RBAC grants and separate English/Chinese stable-code mappings.

## Automated verification

All project commands were run in Docker according to `AGENTS.md`:
- API ESLint, TypeScript typecheck, production build;
- API unit: 35 suites, 272 tests;
- API E2E: 19 suites, 116 tests, including the tracked real fixture
  `samples/workform/Bestar_work_form.xlsx`, idempotent concurrent start,
  concurrent manual result claim, exact role denials, source/raw metadata,
  storage-before-delete protection, unlink, close, and audit history;
- Web ESLint, TypeScript typecheck, 225 tests, and production build;
- Worker Python: 127 tests;
- Prisma generation/format, migration deployment to the existing development
  database and a temporary empty database; both reported 26 migrations and an
  up-to-date schema;
- direct PostgreSQL constraint probes for active-case uniqueness, immutable
  versions, source identity, restrictive deletion, evidence uniqueness,
  transactional rollback, exact seeded role grants, import-row lock
  serialization, and immutable learning-case source snapshots;
- `git diff --check`.

## Manual review steps

1. Upload an `.xlsx` that finishes with `ERROR`, `WARNING`, or unknown/not
   parsed status and start a learning case twice; verify both calls return the
   same case id.
2. Read the case as `ADMIN` and `OFFICE`; verify warehouse and wage-manager
   roles receive 403.
3. Create a manual container with `learningCaseId`; verify the case returns the
   formal source import id/SHA/raw metadata and linked manual result metadata.
4. Attempt to delete the source import; verify
   `IMPORT_USED_BY_PARSER_LEARNING`, an `IMPORT_DELETE_BLOCKED` audit event,
   and unchanged original stored bytes.
5. Unlink and close a dependency-free case; verify the stable source reference
   and audit history remain. Verify a case with non-draft profile history or
   evidence cannot be closed.

## Known boundaries

This Task does not select workbook fingerprints, run profile mappings, expose a
mapping wizard, approve profiles, collect three acceptance evidences, or enable
trusted automatic parsing. Those remain ordered work beginning with
`PARSER-PROFILE-02`.
