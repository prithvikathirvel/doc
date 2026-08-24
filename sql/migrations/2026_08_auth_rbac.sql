-- DMS-owned identity and authorization directory (2026-08).
--
-- Authentication for the web UI happens in Keycloak through the central User
-- Service. This database never stores passwords: it only records which
-- authenticated identity belongs to which tenant and with which role, which
-- legacy x-user-id values were claimed by a canonical user, and which API keys
-- machine clients use.

CREATE TABLE IF NOT EXISTS dms_users (
  user_id CHAR(36) NOT NULL PRIMARY KEY COMMENT 'User Service / Keycloak user id (sub)',
  email VARCHAR(255) NOT NULL,
  username VARCHAR(255) NULL,
  display_name VARCHAR(255) NULL,
  is_platform_admin TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_dms_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tenant_members (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role ENUM('tenant_admin', 'member') NOT NULL DEFAULT 'member',
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_by VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_tenant_members (tenant_id, user_id),
  KEY idx_tenant_members_user (user_id),
  CONSTRAINT fk_tenant_members_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_members_user FOREIGN KEY (user_id) REFERENCES dms_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Legacy x-user-id values (email, employee code, machine id, ...) that have
-- been claimed by a canonical user. tenant_id is '' for global aliases such as
-- the email address; tenant-scoped aliases only match inside one tenant.
CREATE TABLE IF NOT EXISTS dms_user_aliases (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  alias VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_dms_user_alias (alias, tenant_id),
  KEY idx_dms_user_aliases_user (user_id),
  CONSTRAINT fk_dms_user_aliases_user FOREIGN KEY (user_id) REFERENCES dms_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- API keys for machine clients. Only a SHA-256 hash of the key is stored;
-- the full key is shown once at creation time.
CREATE TABLE IF NOT EXISTS dms_api_keys (
  id CHAR(36) NOT NULL PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  tenant_id CHAR(36) NULL COMMENT 'NULL = platform-wide key',
  roles_json JSON NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  expires_at DATETIME NULL,
  last_used_at DATETIME NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_dms_api_keys_hash (key_hash),
  CONSTRAINT fk_dms_api_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Bootstrap note: the first platform administrator does not need a row here.
-- Set DMS_PLATFORM_ADMINS=first.admin@yourcompany.com in the API environment;
-- the flag is persisted to dms_users the first time that person signs in.
