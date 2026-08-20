"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CopyRow } from "@/components/ui/Copy";
import { sessionHeaders } from "@/lib/api";
import { useSession } from "@/contexts/SessionContext";

/**
 * Shows exactly which identity headers the browser sends for the tenant in view,
 * so an integrator can reproduce a request with curl or Postman.
 */
export function SessionHeadersCard({ tenantId }: { tenantId?: string }) {
  const { session } = useSession();
  if (!session) return null;

  const headers = sessionHeaders(tenantId, session);
  const rows = [
    { key: "x-tenant-id", value: headers["x-tenant-id"] || "not sent (no tenant selected)" },
    { key: "x-user-id", value: headers["x-user-id"] || "—" },
    { key: "x-roles", value: headers["x-roles"] || "—" },
  ];

  return (
    <Card>
      <CardHeader
        title="API session"
        description="Headers sent with every request from this browser session."
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
        {headers.idtoken
          ? "An identity token is attached as idtoken and Authorization: Bearer."
          : "No identity token is attached. Add one at sign-in if the API enforces token authentication."}
      </p>
    </Card>
  );
}
