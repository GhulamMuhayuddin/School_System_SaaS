-- Row Level Security + grants. Idempotent: safe to run after EVERY migration (`pnpm db:rls`).
-- Run as the OWNER role (DIRECT_URL). The API connects as nexora_app, which cannot bypass RLS.
--
-- Context settings (set per query by src/db/tenant.ts, transaction-local):
--   app.school_id   -> the school the request belongs to
--   app.bypass_rls  -> 'on' only inside withBypass() (login, seeding, platform admin)

CREATE OR REPLACE FUNCTION app_school_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.school_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_bypass() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'on' $$;

-- Every table with a school_id column gets the standard policy automatically,
-- so tables added in later phases are protected as soon as this script is re-run.
-- Exceptions with custom policies below: roles, audit_logs.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'school_id'
      AND c.table_name NOT IN ('roles', 'audit_logs')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (school_id = app_school_id() OR app_bypass()) WITH CHECK (school_id = app_school_id() OR app_bypass())',
      t);
  END LOOP;
END $$;

-- schools: a school can only see/change itself.
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON schools;
CREATE POLICY tenant_isolation ON schools
  USING (id = app_school_id() OR app_bypass())
  WITH CHECK (id = app_school_id() OR app_bypass());

-- roles: system templates (school_id NULL) are readable by everyone, writable only via bypass.
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON roles;
CREATE POLICY tenant_isolation ON roles
  USING (school_id IS NULL OR school_id = app_school_id() OR app_bypass())
  WITH CHECK (school_id = app_school_id() OR app_bypass());
CREATE UNIQUE INDEX IF NOT EXISTS roles_system_key_unique ON roles (key) WHERE school_id IS NULL;

-- audit_logs: a school reads/writes its own rows; platform-level rows (school_id NULL) need bypass.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
CREATE POLICY tenant_isolation ON audit_logs
  USING (school_id = app_school_id() OR app_bypass())
  WITH CHECK (school_id = app_school_id() OR app_bypass());

-- Grants for the runtime role (no DDL, no superuser, no BYPASSRLS).
GRANT USAGE ON SCHEMA public TO nexora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexora_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexora_app;
REVOKE ALL ON TABLE _prisma_migrations FROM nexora_app;
GRANT EXECUTE ON FUNCTION app_school_id(), app_bypass() TO nexora_app;
