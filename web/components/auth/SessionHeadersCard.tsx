"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CopyRow } from "@/components/ui/Copy";
import { sessionHeaders } from "@/lib/api";
import { useSession } from "@/contexts/SessionContext";

/** Shows the application, tenant and bearer headers used by the browser. */
export function SessionHeadersCard({ tenantId }: { tenantId?: string }) {
  const { session } = useSession();
  if (!session) return null;

  const headers = sessionHeaders(tenantId, session);
  const rows = [
    { key: "x-app-id", value: headers["x-app-id"] || "—" },
    { key: "x-tenant-id", value: headers["x-tenant-id"] || "not sent (no tenant selected)" },
    { key: "authorization", value: headers.authorization ? "Bearer <access token>" : "—" },
  ];

  return (
    <Card>
      <CardHeader
        title="API session"
        description="Application, tenant and bearer headers sent with every request from this browser session."
        action={
          <Badge tone={session.scope === "platform" ? "accent" : "neutral"}>
            {session.scope === "platform" ? "Administrator session" : "Tenant session"}
          </Badge>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <CopyRow key={row.key} label={row.key} value={row.value} />
        ))}
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
        Access tokens are verified by DMS against Keycloak JWKS. The client secret is never sent to this browser.
      </p>
    </Card>
  );
}
