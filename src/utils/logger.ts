import { createLogger, format, transports } from "winston";

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  defaultMeta: { service: "dms" },
  transports: [
    new transports.Console(),
    new transports.File({ filename: "app.log", maxsize: 5_000_000, maxFiles: 3 }),
  ],
});

export function safeLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  const blocked = ["password", "secret", "accesskey", "secretkey", "token", "authorization", "accountkey", "credentials"];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (blocked.some((b) => key.toLowerCase().includes(b))) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

export default logger;
