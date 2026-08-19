import { RowDataPacket } from "mysql2";
import { TenantAnalytics } from "../../service/models";
import { AnalyticsRepository } from "../../service/ports";
import { query } from "../../dbConnection/pool";

const TREND_DAYS = 30;

/** Read-only aggregate queries that power the tenant analytics dashboard. */
export class MysqlAnalyticsRepository implements AnalyticsRepository {
  async tenantAnalytics(tenantId: string): Promise<TenantAnalytics> {
    const params = { tenantId };

    const [documentRows, folderRows, versionRows, contributorRows, mimeRows, trendRows, activityRows] =
      await Promise.all([
        query<RowDataPacket[]>(
          `SELECT
             COUNT(*) AS total,
             SUM(status = 'active') AS active,
             SUM(status = 'pending_upload') AS pending_upload,
             SUM(status = 'failed') AS failed,
             SUM(status = 'soft_deleted') AS in_trash,
             SUM(created_at >= (NOW() - INTERVAL 30 DAY)) AS created_last_30_days,
             COALESCE(SUM(CASE WHEN status = 'active' THEN size ELSE 0 END), 0) AS active_bytes,
             COALESCE(SUM(CASE WHEN status = 'soft_deleted' THEN size ELSE 0 END), 0) AS trash_bytes,
             COALESCE(AVG(CASE WHEN status = 'active' THEN size END), 0) AS average_bytes,
             COALESCE(MAX(CASE WHEN status = 'active' THEN size END), 0) AS largest_bytes,
             COUNT(DISTINCT created_by) AS contributors
           FROM documents WHERE tenant_id = :tenantId`,
          params
        ),
        query<RowDataPacket[]>(
          `SELECT COUNT(*) AS total FROM folders WHERE tenant_id = :tenantId AND deleted_at IS NULL`,
          params
        ),
        query<RowDataPacket[]>(
          `SELECT COUNT(*) AS total, COALESCE(SUM(size), 0) AS bytes
           FROM document_versions WHERE tenant_id = :tenantId`,
          params
        ),
        query<RowDataPacket[]>(
          `SELECT created_by AS user_id, COUNT(*) AS documents, COALESCE(SUM(size), 0) AS bytes
           FROM documents
           WHERE tenant_id = :tenantId AND status <> 'soft_deleted'
           GROUP BY created_by
           ORDER BY documents DESC
           LIMIT 5`,
          params
        ),
        query<RowDataPacket[]>(
          `SELECT mime_type, COUNT(*) AS documents, COALESCE(SUM(size), 0) AS bytes
           FROM documents
           WHERE tenant_id = :tenantId AND status <> 'soft_deleted'
           GROUP BY mime_type
           ORDER BY documents DESC
           LIMIT 6`,
          params
        ),
        query<RowDataPacket[]>(
          `SELECT DATE(created_at) AS day, COUNT(*) AS documents, COALESCE(SUM(size), 0) AS bytes
           FROM documents
           WHERE tenant_id = :tenantId AND created_at >= (CURDATE() - INTERVAL ${TREND_DAYS - 1} DAY)
           GROUP BY DATE(created_at)
           ORDER BY day ASC`,
          params
        ),
        query<RowDataPacket[]>(
          `SELECT action, actor_id, resource_type, resource_id, success, created_at
           FROM audit_logs
           WHERE tenant_id = :tenantId
           ORDER BY created_at DESC
           LIMIT 12`,
          params
        ),
      ]);

    const documents = documentRows[0] || ({} as RowDataPacket);
    const versions = versionRows[0] || ({} as RowDataPacket);

    return {
      tenantId,
      generatedAt: new Date(),
      documents: {
        total: num(documents.total),
        active: num(documents.active),
        pendingUpload: num(documents.pending_upload),
        failed: num(documents.failed),
        inTrash: num(documents.in_trash),
        createdLast30Days: num(documents.created_last_30_days),
      },
      storage: {
        activeBytes: num(documents.active_bytes),
        trashBytes: num(documents.trash_bytes),
        versionBytes: num(versions.bytes),
        averageDocumentBytes: Math.round(num(documents.average_bytes)),
        largestDocumentBytes: num(documents.largest_bytes),
      },
      folders: { total: num(folderRows[0]?.total) },
      versions: { total: num(versions.total) },
      contributors: {
        total: num(documents.contributors),
        top: contributorRows.map((row) => ({
          userId: String(row.user_id),
          documents: num(row.documents),
          bytes: num(row.bytes),
        })),
      },
      fileTypes: mimeRows.map((row) => ({
        mimeType: String(row.mime_type),
        documents: num(row.documents),
        bytes: num(row.bytes),
      })),
      uploadTrend: fillTrend(
        trendRows.map((row) => ({
          date: toIsoDate(row.day),
          documents: num(row.documents),
          bytes: num(row.bytes),
        }))
      ),
      recentActivity: activityRows.map((row) => ({
        action: String(row.action),
        actorId: String(row.actor_id),
        resourceType: String(row.resource_type),
        resourceId: String(row.resource_id),
        success: Boolean(row.success),
        createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
      })),
    };
  }
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString().slice(0, 10);
}

/** Guarantees one point per day so the chart never renders gaps. */
function fillTrend(
  rows: Array<{ date: string; documents: number; bytes: number }>
): Array<{ date: string; documents: number; bytes: number }> {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const output: Array<{ date: string; documents: number; bytes: number }> = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - (TREND_DAYS - 1));
  for (let index = 0; index < TREND_DAYS; index += 1) {
    const key = cursor.toISOString().slice(0, 10);
    output.push(byDate.get(key) || { date: key, documents: 0, bytes: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return output;
}
