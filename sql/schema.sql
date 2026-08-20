-- Vendor-agnostic Document Management System
-- MySQL 8.0+
-- The database stores metadata and storage references only. File bytes live in S3 / MinIO / GCS / Azure.

CREATE DATABASE IF NOT EXISTS dms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dms;

CREATE TABLE IF NOT EXISTS tenants (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  owner_name VARCHAR(255) NULL,
  owner_email VARCHAR(255) NULL,
  max_file_size_bytes BIGINT NOT NULL DEFAULT 52428800,
  allowed_mime_types JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

-- One active storage backend per tenant.
-- Secret values are NEVER stored here. Store environment variable names in *_ref columns.
CREATE TABLE IF NOT EXISTS storage_configs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL UNIQUE,
  provider ENUM('s3', 'minio', 'gcp', 'azure') NOT NULL,
  container VARCHAR(255) NOT NULL,
  region VARCHAR(100) NULL,
  endpoint VARCHAR(500) NULL,
  access_key_ref VARCHAR(255) NULL,
  secret_key_ref VARCHAR(255) NULL,
  session_token_ref VARCHAR(255) NULL,
  project_id VARCHAR(255) NULL,
  account_name VARCHAR(255) NULL,
  credentials_json_ref VARCHAR(255) NULL,
  base_prefix VARCHAR(255) NULL,
  use_ssl TINYINT(1) NOT NULL DEFAULT 1,
  signed_url_ttl_seconds INT NOT NULL DEFAULT 900,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_storage_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS folders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  path VARCHAR(1000) NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  updated_by VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_folder_name (tenant_id, parent_id, name),
  KEY idx_folders_tenant_parent (tenant_id, parent_id),
  KEY idx_folders_tenant_path (tenant_id, path(255)),
  CONSTRAINT fk_folders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_folders_parent FOREIGN KEY (parent_id) REFERENCES folders(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  folder_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  checksum VARCHAR(128) NULL,
  storage_provider VARCHAR(32) NOT NULL,
  storage_container VARCHAR(255) NOT NULL,
  storage_key VARCHAR(1024) NOT NULL,
  current_version INT NOT NULL DEFAULT 1,
  status ENUM('pending_upload', 'active', 'soft_deleted', 'failed') NOT NULL DEFAULT 'pending_upload',
  created_by VARCHAR(255) NOT NULL,
  updated_by VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  idempotency_key VARCHAR(128) NULL,
  metadata_json JSON NULL,
  UNIQUE KEY uq_documents_idempotency (tenant_id, idempotency_key),
  KEY idx_documents_tenant_status (tenant_id, status),
  KEY idx_documents_tenant_folder (tenant_id, folder_id),
  KEY idx_documents_tenant_created (tenant_id, created_at),
  KEY idx_documents_tenant_owner (tenant_id, created_by),
  CONSTRAINT fk_documents_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_documents_folder FOREIGN KEY (folder_id) REFERENCES folders(id)
);

-- DMS-level versioning. Do not rely on vendor object versioning.
CREATE TABLE IF NOT EXISTS document_versions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  document_id CHAR(36) NOT NULL,
  tenant_id CHAR(36) NOT NULL,
  version_number INT NOT NULL,
  storage_provider VARCHAR(32) NOT NULL,
  storage_container VARCHAR(255) NOT NULL,
  storage_key VARCHAR(1024) NOT NULL,
  checksum VARCHAR(128) NULL,
  size BIGINT NOT NULL DEFAULT 0,
  mime_type VARCHAR(255) NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_document_version (document_id, version_number),
  KEY idx_versions_tenant (tenant_id, document_id),
  CONSTRAINT fk_versions_document FOREIGN KEY (document_id) REFERENCES documents(id),
  CONSTRAINT fk_versions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS document_permissions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  principal_type ENUM('user', 'role') NOT NULL,
  principal_id VARCHAR(255) NOT NULL,
  can_read TINYINT(1) NOT NULL DEFAULT 1,
  can_write TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  can_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_permission (document_id, principal_type, principal_id),
  KEY idx_permissions_tenant (tenant_id, document_id),
  KEY idx_permissions_principal (tenant_id, principal_type, principal_id),
  CONSTRAINT fk_permissions_document FOREIGN KEY (document_id) REFERENCES documents(id),
  CONSTRAINT fk_permissions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(36) NOT NULL,
  provider VARCHAR(32) NULL,
  success TINYINT(1) NOT NULL,
  error_category VARCHAR(64) NULL,
  duration_ms INT NULL,
  details_json JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_audit_tenant_time (tenant_id, created_at),
  KEY idx_audit_resource (resource_type, resource_id)
);
