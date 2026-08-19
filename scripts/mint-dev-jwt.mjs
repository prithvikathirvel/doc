#!/usr/bin/env node
/**
 * Mint a development JWT accepted by this DMS when AUTH_DISABLED=false.
 *
 * Usage:
 *   node scripts/mint-dev-jwt.mjs
 *   node scripts/mint-dev-jwt.mjs --tenant 11111111-1111-1111-1111-111111111111 \
 *     --sub alice --name "Alice Kumar" --roles tenant_admin --secret dev-secret
 *
 * The API must have the SAME secret:
 *   AUTH_DISABLED=false
 *   JWT_SECRET=dev-secret
 *
 * Paste the printed token into the web UI Login/Settings "JWT idtoken" field,
 * or send it as:  -H "idtoken: <token>"
 */
import jwt from "jsonwebtoken";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadDotEnv() {
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

loadDotEnv();

const tenantId = arg("tenant", "11111111-1111-1111-1111-111111111111");
const sub = arg("sub", "alice");
const name = arg("name", "Alice Kumar");
const rolesRaw = arg("roles", "tenant_admin");
const secret = arg("secret", process.env.JWT_SECRET || "dev-secret");
const expiresIn = arg("expires", "8h");

const roles = rolesRaw.split(",").map((r) => r.trim()).filter(Boolean);

const payload = {
  sub,
  preferred_username: name,
  name,
  tenant_id: tenantId,
  tid: tenantId,
  roles,
};

const token = jwt.sign(payload, secret, { expiresIn, algorithm: "HS256" });

console.log("");
console.log("=== DMS dev JWT ===");
console.log("tenant_id :", tenantId);
console.log("sub       :", sub);
console.log("name      :", name);
console.log("roles     :", roles.join(", ") || "(none)");
console.log("secret    :", secret === "dev-secret" ? "dev-secret (default)" : "(from --secret or JWT_SECRET)");
console.log("expires   :", expiresIn);
console.log("");
console.log(token);
console.log("");
console.log("API .env must include:");
console.log("  AUTH_DISABLED=false");
console.log(`  JWT_SECRET=${secret}`);
console.log("");
console.log("curl example:");
console.log(
  `  curl -s http://127.0.0.1:3001/api/tenants/me -H "idtoken: ${token.slice(0, 24)}…" -H "x-tenant-id: ${tenantId}"`
);
console.log("");
console.log("Web UI: Login or Settings → paste the full token into “JWT idtoken”.");
console.log("");
