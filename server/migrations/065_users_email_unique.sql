-- P0 — admin identity hardening: the authoritative auth email is identity
-- provenance for the admin/super_admin allowlist. It must be UNIQUE so a user
-- row can never carry an allowlisted admin email via profile mutations.
--
-- SAFE BY DESIGN:
--   * partial expression index — only non-null, non-blank emails participate
--     (rows with NULL/'' emails are never constrained);
--   * case/whitespace-normalized (lower(trim(email))) so
--     "admin@vauto.com" and " Admin@VAUTO.com " collide;
--   * IF existing duplicates exist, the migration SKIPS index creation with
--     a NOTICE (no destructive dedup) — operators must dedup manually first,
--     then re-run. NEVER applied automatically in production deployments
--     before the dedup is confirmed.
DO $$
DECLARE
  dupes int;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT lower(trim(email)) AS norm
    FROM users
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY 1
    HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE NOTICE 'users.email duplicates exist (%), unique index skipped — manual dedup required', dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_norm
      ON users (lower(trim(email)))
      WHERE email IS NOT NULL AND btrim(email) <> '';
  END IF;
END $$;
