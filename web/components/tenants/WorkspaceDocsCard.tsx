"use client";

import { useEffect, useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/Copy";
import { docsApi } from "@/lib/api";
import { BASE_PATH } from "@/lib/basePath";
import type { TenantDocConfig } from "@/lib/types";

/**
 * Shows the developer-documentation link to workspace members, when a platform
 * administrator has generated and enabled one for this tenant. Hidden otherwise.
 */
export function WorkspaceDocsCard({ tenantId }: { tenantId: string }) {
  const [config, setConfig] = useState<TenantDocConfig | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    docsApi
      .getConfig(tenantId)
      .then(({ config: saved }) => {
        if (!cancelled) setConfig(saved && saved.status === "active" ? saved : null);
      })
      .catch(() => {
        /* documentation is optional; fail silently */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (!ready || !config) return null;

  const link =
    typeof window !== "undefined" ? `${window.location.origin}${BASE_PATH}/docs/${config.shareToken}` : "";

  return (
    <Card>
      <CardHeader
        title="Developer documentation"
        description="How to call the document and folder APIs for this workspace."
      />
      <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
        <BookOpen className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text)]" title={link}>
          {link}
        </span>
        <CopyButton value={link} label="Copy link" />
        <a href={link} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" size="sm" leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
            Open
          </Button>
        </a>
      </div>
    </Card>
  );
}
