import dotenv from "dotenv";

dotenv.config();

function env(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  return value;
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = env(name);
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

export const settings = {
  port: envInt("PORT", 3000),
  host: env("HOST", "0.0.0.0") as string,
  jwtSecret: env("JWT_SECRET"),
  authDisabled: envBool("AUTH_DISABLED", false),
  mysql: {
    host: env("MYSQL_HOST", "localhost") as string,
    port: envInt("MYSQL_PORT", 3306),
    user: env("MYSQL_USER", "root") as string,
    password: env("MYSQL_PASSWORD", ""),
    database: env("MYSQL_DB", "dms") as string,
  },
  defaultSignedUrlTtlSeconds: envInt("SIGNED_URL_TTL_SECONDS", 900),
  maxUploadBytes: envInt("MAX_UPLOAD_BYTES", 100 * 1024 * 1024),
};

export function resolveSecret(ref?: string): string | undefined {
  if (!ref) return undefined;
  if (ref.startsWith("env:")) {
    return process.env[ref.slice(4)];
  }
  return process.env[ref] ?? ref;
}
