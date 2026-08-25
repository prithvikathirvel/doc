"use client";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { TenantSettingsView } from "@/components/tenants/TenantSettingsView";
import { WorkspaceDocsCard } from "@/components/tenants/WorkspaceDocsCard";
import { FolderMapsManager } from "@/components/folders/FolderMapsManager";
import { useSession } from "@/contexts/SessionContext";
import { TENANT_ADMIN_ROLE } from "@/lib/session";

export default function WorkspaceSettingsPage() {
  const { session } = useSession();
  const tenantId = session?.tenantId || "";
  const isTenantAdmin = Boolean(session?.roles.includes(TENANT_ADMIN_ROLE));

  return (
    <WorkspaceShell
      title="Workspace settings"
      subtitle={
        isTenantAdmin
          ? "Storage target and workspace details"
          : "Workspace details shared by your administrator"
      }
    >
      {tenantId ? (
        <div className="space-y-4">
          <TenantSettingsView
            tenantId={tenantId}
            canEditProfile={false}
            canEditStorage={isTenantAdmin}
          />
          <WorkspaceDocsCard tenantId={tenantId} />
          <FolderMapsManager tenantId={tenantId} canEdit={isTenantAdmin} />
        </div>
      ) : (
        <LoadingBlock />
      )}
    </WorkspaceShell>
  );
}
