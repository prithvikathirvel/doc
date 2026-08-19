import { RowDataPacket } from "mysql2";
import { Tenant, TenantStorageConfig } from "../../service/models";
import { TenantRepository } from "../../service/ports";
import { execute, query } from "../../dbConnection/pool";
import { mapStorageConfig, mapTenant } from "./mappers";

export class MysqlTenantRepository implements TenantRepository {
  async create(tenant: Tenant): Promise<Tenant> {
    await execute(
      `INSERT INTO tenants
        (id, name, slug, status, owner_name, owner_email, max_file_size_bytes, allowed_mime_types, created_at, updated_at)
       VALUES
        (:id, :name, :slug, :status, :ownerName, :ownerEmail, :maxFileSizeBytes, :allowedMimeTypes, :createdAt, :updatedAt)`,
      {
        ...tenant,
        allowedMimeTypes: tenant.allowedMimeTypes ? JSON.stringify(tenant.allowedMimeTypes) : null,
      }
    );
    return tenant;
  }

  async update(tenant: Tenant): Promise<Tenant> {
    await execute(
      `UPDATE tenants SET
         name = :name,
         slug = :slug,
         status = :status,
         owner_name = :ownerName,
         owner_email = :ownerEmail,
         max_file_size_bytes = :maxFileSizeBytes,
         allowed_mime_types = :allowedMimeTypes,
         updated_at = :updatedAt
       WHERE id = :id`,
      {
        ...tenant,
        allowedMimeTypes: tenant.allowedMimeTypes ? JSON.stringify(tenant.allowedMimeTypes) : null,
      }
    );
    return tenant;
  }

  async findById(id: string): Promise<Tenant | null> {
    const rows = await query<RowDataPacket[]>(`SELECT * FROM tenants WHERE id = :id LIMIT 1`, { id });
    return rows[0] ? mapTenant(rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const rows = await query<RowDataPacket[]>(`SELECT * FROM tenants WHERE slug = :slug LIMIT 1`, { slug });
    return rows[0] ? mapTenant(rows[0]) : null;
  }

  async list(): Promise<Tenant[]> {
    const rows = await query<RowDataPacket[]>(`SELECT * FROM tenants ORDER BY name ASC`);
    return rows.map(mapTenant);
  }

  async upsertStorageConfig(config: TenantStorageConfig): Promise<TenantStorageConfig> {
    await execute(
      `INSERT INTO storage_configs
        (id, tenant_id, provider, container, region, endpoint, access_key_ref, secret_key_ref,
         session_token_ref, project_id, account_name, credentials_json_ref, base_prefix,
         use_ssl, signed_url_ttl_seconds, created_at, updated_at)
       VALUES
        (:id, :tenantId, :provider, :container, :region, :endpoint, :accessKeyRef, :secretKeyRef,
         :sessionTokenRef, :projectId, :accountName, :credentialsJsonRef, :basePrefix,
         :useSsl, :signedUrlTtlSeconds, :createdAt, :updatedAt)
       ON DUPLICATE KEY UPDATE
         provider = VALUES(provider),
         container = VALUES(container),
         region = VALUES(region),
         endpoint = VALUES(endpoint),
         access_key_ref = VALUES(access_key_ref),
         secret_key_ref = VALUES(secret_key_ref),
         session_token_ref = VALUES(session_token_ref),
         project_id = VALUES(project_id),
         account_name = VALUES(account_name),
         credentials_json_ref = VALUES(credentials_json_ref),
         base_prefix = VALUES(base_prefix),
         use_ssl = VALUES(use_ssl),
         signed_url_ttl_seconds = VALUES(signed_url_ttl_seconds),
         updated_at = VALUES(updated_at)`,
      { ...config, useSsl: config.useSsl ? 1 : 0 }
    );
    return config;
  }

  async getStorageConfig(tenantId: string): Promise<TenantStorageConfig | null> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM storage_configs WHERE tenant_id = :tenantId LIMIT 1`,
      { tenantId }
    );
    return rows[0] ? mapStorageConfig(rows[0]) : null;
  }
}
