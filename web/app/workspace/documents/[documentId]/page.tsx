"use client";

import { use } from "react";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { DocumentDetailView } from "@/components/workspace/DocumentDetailView";
import { useSession } from "@/contexts/SessionContext";

export default function WorkspaceDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);
  const { session } = useSession();
  const tenantId = session?.tenantId || "";

  return (
    <WorkspaceShell title="Document" subtitle="Versions, metadata and access">
      {tenantId ? (
        <DocumentDetailView tenantId={tenantId} basePath="/workspace" documentId={documentId} />
      ) : (
        <LoadingBlock />
      )}
    </WorkspaceShell>
  );
}
