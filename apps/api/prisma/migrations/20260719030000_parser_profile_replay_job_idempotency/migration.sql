-- Replay callers own their idempotency key for the lifetime of a case revision.
-- Other async job types retain their existing active-job retry behavior.
CREATE UNIQUE INDEX "async_jobs_parser_profile_replay_idempotency_key_key"
ON "async_jobs"("idempotency_key")
WHERE "job_type" = 'PARSER_PROFILE_REPLAY';
