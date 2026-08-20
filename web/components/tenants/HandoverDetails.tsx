"use client";

import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CopyRow } from "@/components/ui/Copy";
import type { Tenant } from "@/lib/types";
import { formatBytes, providerLabel } from "@/lib/utils";

export function appOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** The link handed to a customer. It pre-fills the workspace field on the sign-in page. */
export function workspaceSignInLink(slug: string): string {
  return `${appOrigin()}/login?workspace=${encodeURIComponent(slug)}`;
}

export function handoverText(
  tenant: Tenant,
  storage?: { provider: string; container: string } | null
): string {
  return [
    `Workspace: ${tenant.name}`,
    `Workspace ID: ${tenant.slug}`,
    `Sign-in link: ${workspaceSignInLink(tenant.slug)}`,
    `Owner sign-in: ${tenant.ownerEmail || "not set"}`,
    `Tenant ID (API header x-tenant-id): ${tenant.id}`,
    `Maximum file size: ${formatBytes(tenant.maxFileSizeBytes)}`,
    storage ? `Storage: ${providerLabel(storage.provider)} · ${storage.container}` : "Storage: not configured",
  ].join("\n");
}

/**
 * The four values a customer needs, each with a plain explanation of what it is for.
 * Shown after onboarding and permanently on the tenant page.
 */
export function HandoverDetails({
  tenant,
  storage,
  showDownload = true,
}: {
  tenant: Tenant;
  storage?: { provider: string; container: string } | null;
  showDownload?: boolean;
}) {
  const link = workspaceSignInLink(tenant.slug);

  const download = () => {
    const blob = new Blob([handoverText(tenant, storage)], { type: "text/plain" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${tenant.slug}-workspace-details.txt`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <CopyRow
          label="Workspace ID"
          value={tenant.slug}
          hint="Typed in the Workspace field on the sign-in page."
        />
        <CopyRow
          label="Sign-in link"
          value={link}
          mono={false}
          hint="Send this to the customer — the workspace field is pre-filled."
        />
        <CopyRow
          label="Owner sign-in"
          value={tenant.ownerEmail || "Not set"}
          mono={false}
          hint="This address signs in as the workspace administrator."
        />
        <CopyRow
          label="Tenant ID"
          value={tenant.id}
          hint="Used by API clients in the x-tenant-id header."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a href={link} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" size="sm" leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
            Open sign-in page
          </Button>
        </a>
        {showDownload && (
          <Button
            variant="secondary"
            size="sm"
            onClick={download}
            leftIcon={<Download className="h-3.5 w-3.5" />}
          >
            Download details
          </Button>
        )}
      </div>
    </div>
  );
}
