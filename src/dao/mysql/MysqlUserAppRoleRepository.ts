import { RowDataPacket } from "mysql2";
import { execute, query } from "../../dbConnection/pool";
import { UserAppRoleRepository } from "../../service/ports";
import { settings } from "../../config/settings";

export class MysqlUserAppRoleRepository implements UserAppRoleRepository {
  async find(userId: string): Promise<string[] | null> {
    const rows = await query<RowDataPacket[]>(
      `SELECT roles FROM user_app_roles WHERE user_id = :userId LIMIT 1`,
      { userId }
    );
    if (!rows[0]) return null;
    const stored = rows[0].roles;
    const roles = typeof stored === "string" ? safeParse(stored) : stored;
    return Array.isArray(roles) ? roles.map(String).filter(Boolean) : [];
  }

  async upsert(userId: string, roles: string[]): Promise<void> {
    await execute(
      `INSERT INTO user_app_roles (user_id, app_id, roles)
       VALUES (:userId, :appId, :roles)
       ON DUPLICATE KEY UPDATE
         app_id = VALUES(app_id),
         roles = VALUES(roles),
         updated_at = CURRENT_TIMESTAMP`,
      { userId, appId: settings.dmsAppId, roles: JSON.stringify(roles) }
    );
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}
