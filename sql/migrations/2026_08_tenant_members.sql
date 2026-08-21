-- DMS migration: map verified Keycloak user subjects to DMS tenants.
-- Run this once on an existing database. sql/schema.sql includes the same
-- table for fresh installations.

USE dms;

CREATE TABLE IF NOT EXISTS tenant_members (
  id              CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id       CHAR(36) NOT NULL,
  user_id         VARCHAR(128) NOT NULL,
  email           VARCHAR(320) NULL,
  role            ENUM('tenant_admin', 'member') NOT NULL DEFAULT 'member',
  status          ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenant_user (tenant_id, user_id),
  KEY idx_user_id (user_id),
  CONSTRAINT fk_tenant_members_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
