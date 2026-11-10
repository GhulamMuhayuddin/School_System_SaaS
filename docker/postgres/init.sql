-- Runtime role used by the API. It is NOT a superuser and has NO BYPASSRLS,
-- so Row Level Security tenant isolation is enforced on every query it runs.
-- Dev password only: change it in any shared or production environment.
CREATE ROLE nexora_app LOGIN PASSWORD 'nexora_app_dev_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
