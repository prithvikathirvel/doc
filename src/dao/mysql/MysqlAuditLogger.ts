import { v4 as uuidv4 } from "uuid";
import { AuditEvent } from "../../service/models";
import { AuditLogger } from "../../service/ports";
import logger, { safeLogFields } from "../../utils/logger";
import { execute } from "../../dbConnection/pool";

export class MysqlAuditLogger implements AuditLogger {
  async record(event: AuditEvent): Promise<void> {
    logger.info("dms_audit", safeLogFields({
      tenantId: event.tenantId,
      actorId: event.actorId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      provider: event.provider,
      success: event.success,
      errorCategory: event.errorCategory,
      durationMs: event.durationMs,
    }));
    try {
      await execute(
        `INSERT INTO audit_logs
          (id, tenant_id, actor_id, action, resource_type, resource_id, provider, success, error_category, duration_ms, details_json, created_at)
         VALUES
          (:id, :tenantId, :actorId, :action, :resourceType, :resourceId, :provider, :success, :errorCategory, :durationMs, :detailsJson, NOW())`,
        {
          id: uuidv4(),
          tenantId: event.tenantId,
          actorId: event.actorId,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          provider: event.provider || null,
          success: event.success ? 1 : 0,
          errorCategory: event.errorCategory || null,
          durationMs: event.durationMs ?? null,
          detailsJson: JSON.stringify(event.details || {}),
        }
      );
    } catch (err) {
      logger.error("audit_persist_failed", { error: (err as Error).message });
    }
  }
}
