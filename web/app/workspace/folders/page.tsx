"use client";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { FoldersView } from "@/components/workspace/FoldersView";
import { useSession } from "@/contexts/SessionContext";

export default function WorkspaceFoldersPage() {
  const { session } = useSession();
  const tenantId = session?.tenantId || "";

  return (
    <WorkspaceShell title="Folders" subtitle="Organise documents into a folder hierarchy">
      {tenantId ? <FoldersView tenantId={tenantId} /> : <LoadingBlock />}
    </WorkspaceShell>
  );
}
