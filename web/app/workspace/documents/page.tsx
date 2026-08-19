"use client";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { DocumentsView } from "@/components/workspace/DocumentsView";
import { useSession } from "@/contexts/SessionContext";

export default function WorkspaceDocumentsPage() {
  const { session, tenant } = useSession();
  const tenantId = session?.tenantId || "";

  return (
    <WorkspaceShell title="Documents" subtitle="Everything you can access in this workspace">
      {tenantId ? (
        <DocumentsView
          tenantId={tenantId}
          basePath="/workspace"
          maxFileSizeBytes={tenant?.maxFileSizeBytes}
        />
      ) : (
        <LoadingBlock />
      )}
    </WorkspaceShell>
  );
}
