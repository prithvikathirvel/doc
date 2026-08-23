-- Application-level role cache.
--
-- The Keycloak access token carries NO role claims, so DMS persists the
-- application role learned at login (platform_admin / tenant_admin / member)
-- here. The role resolver reads this on every request, which keeps authorization
-- working across restarts and behind a load balancer without depending on the
-- access token or the User Service's authenticated endpoints.
--
-- Run once per environment:
--   mysql -h 127.0.0.1 -u root -proot dms < sql/migrations/2026_08_user_app_roles.sql

USE dms;

CREATE TABLE IF NOT EXISTS user_app_roles (
  user_id VARCHAR(128) NOT NULL PRIMARY KEY,
  app_id VARCHAR(64) NOT NULL DEFAULT 'DMS',
  roles JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user_app_roles_app (app_id)
);
