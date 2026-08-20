import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { settings } from "../config/settings";
import { ConflictError, DatabaseError, ValidationError } from "../utils/errors";
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

/**
 * mysql2 refuses `undefined` bind parameters. Optional columns are modelled as
 * `undefined` in the domain, so they are converted to SQL NULL here instead of
 * failing the request with a driver-level error.
 */
export function normalizeParams(params?: unknown): unknown {
  if (params === undefined || params === null) return params;
  if (Array.isArray(params)) return params.map((value) => (value === undefined ? null : value));
  if (typeof params === "object" && params.constructor === Object) {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      normalized[key] = value === undefined ? null : value;
    }
    return normalized;
  }
  return params;
}

interface MysqlError extends Error {
  code?: string;
  errno?: number;
  sqlState?: string;
  sqlMessage?: string;
}

/** Turns driver errors into typed application errors while keeping the SQL detail in the logs. */
function translate(error: unknown, sql: string): never {
  const err = error as MysqlError;
  const details = {
    driverCode: err.code,
    errno: err.errno,
    sqlState: err.sqlState,
    sqlMessage: err.sqlMessage,
    statement: sql.replace(/\s+/g, " ").trim().slice(0, 240),
  };
  logger.error("database_error", { ...details, message: err.message });

  switch (err.code) {
    case "ER_DUP_ENTRY":
      throw new ConflictError("A record with the same unique value already exists");
    case "ER_NO_REFERENCED_ROW":
    case "ER_NO_REFERENCED_ROW_2":
      throw new ValidationError("A referenced record does not exist");
    case "ER_DATA_TOO_LONG":
      throw new ValidationError(`A value is too long for column ${err.sqlMessage || ""}`.trim());
    case "ER_BAD_NULL_ERROR":
      throw new ValidationError("A required value is missing");
    case "ECONNREFUSED":
    case "PROTOCOL_CONNECTION_LOST":
    case "ER_ACCESS_DENIED_ERROR":
      throw new DatabaseError("The database is unavailable", details);
    default:
      throw new DatabaseError(err.sqlMessage || err.message || "Database operation failed", details);
  }
}

export async function query<T extends RowDataPacket[]>(sql: string, params?: unknown): Promise<T> {
  try {
    const [rows] = await getPool().query<T>(sql, normalizeParams(params));
    return rows;
  } catch (error) {
    translate(error, sql);
  }
}

export async function execute(sql: string, params?: unknown): Promise<ResultSetHeader> {
  try {
    const [result] = await getPool().execute<ResultSetHeader>(sql, normalizeParams(params));
    return result;
  } catch (error) {
    translate(error, sql);
  }
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
