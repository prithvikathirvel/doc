import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { settings } from "../config/settings";
import logger from "../utils/logger";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: settings.mysql.host,
      port: settings.mysql.port,
      user: settings.mysql.user,
      password: settings.mysql.password,
      database: settings.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
    });
  }
  return pool;
}

export async function query<T extends RowDataPacket[]>(sql: string, params?: unknown): Promise<T> {
  const [rows] = await getPool().query<T>(sql, params);
  return rows;
}

export async function execute(sql: string, params?: unknown): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch (err) {
    logger.error("mysql_ping_failed", { error: (err as Error).message });
    return false;
  }
}
