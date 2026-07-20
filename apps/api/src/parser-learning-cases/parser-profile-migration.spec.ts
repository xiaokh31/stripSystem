import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('parser-profile foundation migration', () => {
  const migration = [
    '20260718170000_parser_profile_foundation',
    '20260718173000_link_profile_versions_to_learning_cases',
    '20260718181500_protect_learning_case_source_snapshot',
    '20260719020000_parser_profile_learning_replay',
    '20260719030000_parser_profile_replay_job_idempotency',
    '20260719040000_parser_profile_completion_governance',
  ]
    .map((directory) =>
      readFileSync(
        resolve(process.cwd(), 'prisma/migrations', directory, 'migration.sql'),
        'utf8',
      ),
    )
    .join('\n');

  it('pins active case, manual container, and evidence uniqueness in PostgreSQL', () => {
    expect(migration).toContain('"parser_learning_cases_source_import_id_key"');
    expect(migration).toContain(
      '"parser_learning_cases_linked_container_id_key"',
    );
    expect(migration).toContain(
      '"parser_profile_evidence_profile_version_id_import_file_id_key"',
    );
    expect(migration).toContain(
      '"parser_profile_versions_family_id_version_key"',
    );
  });

  it('restricts source/evidence deletion and never cascades historical profile rows', () => {
    expect(migration).toMatch(
      /parser_learning_cases_source_import_id_fkey[\s\S]+ON DELETE RESTRICT/,
    );
    expect(migration).toMatch(
      /parser_profile_evidence_import_file_id_fkey[\s\S]+ON DELETE RESTRICT/,
    );
    expect(migration).not.toMatch(
      /parser_(?:profile|learning)[\s\S]{0,160}ON DELETE CASCADE/,
    );
  });

  it('enforces immutable profile definitions and consistent state pairs', () => {
    expect(migration).toContain('prevent_parser_profile_definition_update');
    expect(migration).toContain('PARSER_PROFILE_DEFINITION_IMMUTABLE');
    expect(migration).toContain('PARSER_LEARNING_SOURCE_SNAPSHOT_IMMUTABLE');
    expect(migration).toContain(
      'parser_learning_cases_source_snapshot_immutable',
    );
    expect(migration).toContain('parser_learning_cases_state_check');
    expect(migration).toContain('parser_profile_evidence_outcome_check');
    expect(migration).toContain('containers_parser_source_identity_check');
    expect(migration).toContain(
      'parser_profile_versions_source_learning_case_id_fkey',
    );
  });

  it('seeds the exact ADMIN and OFFICE permission matrix', () => {
    for (const permission of [
      'parser_profiles.read',
      'parser_profiles.train',
      'parser_profiles.review',
      'parser_profiles.approve',
    ]) {
      expect(migration).toContain(permission);
    }
    expect(migration).toContain("('OFFICE', 'parser_profiles.read')");
    expect(migration).toContain("('OFFICE', 'parser_profiles.train')");
    expect(migration).toContain("('OFFICE', 'parser_profiles.review')");
    expect(migration).not.toContain("('OFFICE', 'parser_profiles.approve')");
    expect(migration).not.toContain("('WAREHOUSE', 'parser_profiles.read')");
    expect(migration).not.toContain("('HR_MANAGER', 'parser_profiles.read')");
    expect(migration).not.toContain(
      "('WAREHOUSE_MANAGER', 'parser_profiles.read')",
    );
  });

  it('pins one completion outbox and validates profile governance state', () => {
    expect(migration).toContain(
      'parser_learning_cases_completion_replay_job_id_key',
    );
    expect(migration).toContain(
      'parser_learning_cases_completion_snapshot_check',
    );
    expect(migration).toContain(
      'parser_profile_versions_approval_state_check',
    );
    expect(migration).toContain(
      'parser_profile_versions_trust_streak_check',
    );
    expect(migration).toContain("'PROFILE_RESUMED'");
    expect(migration).toContain("'PROFILE_VERSION_FORKED'");
  });
});
