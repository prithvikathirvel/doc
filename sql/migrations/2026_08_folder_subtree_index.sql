-- Supports recursive folder operations: the subtree of a folder is matched by a
-- path prefix, so the delete and summary statements stay index-backed.

USE dms;

ALTER TABLE folders
  ADD INDEX idx_folders_tenant_path (tenant_id, path(255));
