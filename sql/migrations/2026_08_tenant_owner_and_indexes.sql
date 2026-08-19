-- Adds tenant owner contact details and the indexes used by permission filtering
-- and tenant analytics. Safe to run on an existing database.

USE dms;

ALTER TABLE tenants
  ADD COLUMN owner_name VARCHAR(255) NULL AFTER status,
  ADD COLUMN owner_email VARCHAR(255) NULL AFTER owner_name;

ALTER TABLE documents
  ADD INDEX idx_documents_tenant_created (tenant_id, created_at),
  ADD INDEX idx_documents_tenant_owner (tenant_id, created_by);

ALTER TABLE document_permissions
  ADD INDEX idx_permissions_principal (tenant_id, principal_type, principal_id);
