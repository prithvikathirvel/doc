"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CopyRow } from "@/components/ui/Copy";
import { useSession } from "@/contexts/SessionContext";

/**
 * Shows how this browser session authenticates against the API, so an
 * integrator can see what the web app does — and what machine clients should
 * do differently (an API key, not a cookie).
 */
export function SessionHeadersCard({ tenantId }: { tenantId?: string }) {
  const { session } = useSession();
  if (!session) return null;

  const rows = [
    { key: "Cookie", value: "dms_at=••••• (httpOnly — not readable from JavaScript)" },
    { key: "x-tenant-id", value: tenantId || session.tenantId || "not sent (no workspace selected)" },
    { key: "x-dms-client", value: "web (CSRF marker on every change request)" },
  ];

  return (
    <Card>
      <CardHeader
        title="API session"
        description="How this browser authenticates. Machine clients use an x-api-key instead."
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
        Sign-in happens at POST /api/auth/login (Keycloak via the User Service); tokens stay in
        httpOnly cookies and are refreshed by the API. Non-UI integrations should request an API
        key from a platform administrator and send it as the x-api-key header.
      </p>
    </Card>
  );
}
