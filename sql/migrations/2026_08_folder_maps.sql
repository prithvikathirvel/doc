-- Tenant-defined folder maps: named path templates that let each tenant's
-- applications file documents into their own taxonomy (e.g.
-- submissions/{orgId}/{formId}) with one API call. The map is the stable
-- contract integrations call; the DMS resolves and ensures the path.
--
-- One row per (tenant, key). PUT replaces the tenant's set.

CREATE TABLE IF NOT EXISTS dms_folder_maps (
  id            CHAR(36)     NOT NULL,
  tenant_id     CHAR(36)     NOT NULL,
  map_key       VARCHAR(100) NOT NULL,
  path_template VARCHAR(500) NOT NULL,
  description   VARCHAR(500) NULL,
  status        ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_by    VARCHAR(255) NOT NULL,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_folder_maps_tenant_key (tenant_id, map_key),
  CONSTRAINT fk_folder_maps_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
