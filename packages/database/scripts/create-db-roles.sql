-- Least-privilege DB roles for Barstock production
-- Run as a superuser (e.g. postgres) against the barstock database.
--
-- barstock_app    — runtime app user (SELECT/INSERT/UPDATE/DELETE only)
-- barstock_migrate — migration user (schema changes)

-- 1. Create roles (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'barstock_app') THEN
    CREATE ROLE barstock_app LOGIN PASSWORD 'CHANGE_ME_APP';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'barstock_migrate') THEN
    CREATE ROLE barstock_migrate LOGIN PASSWORD 'CHANGE_ME_MIGRATE';
  END IF;
END
$$;

-- 2. App role: DML only
GRANT CONNECT ON DATABASE barstock TO barstock_app;
GRANT USAGE ON SCHEMA public TO barstock_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO barstock_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO barstock_app;

-- Future tables/sequences auto-inherit these grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barstock_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO barstock_app;

-- 3. Migration role: DML + DDL
GRANT CONNECT ON DATABASE barstock TO barstock_migrate;
GRANT USAGE, CREATE ON SCHEMA public TO barstock_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO barstock_migrate;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO barstock_migrate;
GRANT CREATE ON SCHEMA public TO barstock_migrate;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barstock_migrate;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO barstock_migrate;

-- Migration role also needs DDL privileges (ALTER, DROP, REFERENCES, TRIGGER)
-- These are granted implicitly to the table owner, so barstock_migrate should
-- own tables created by migrations. For existing tables owned by another user:
-- ALTER TABLE <table> OWNER TO barstock_migrate;
-- Or grant specific privileges:
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO barstock_migrate;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO barstock_migrate;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO barstock_migrate;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO barstock_migrate;
