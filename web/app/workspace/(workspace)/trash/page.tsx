"use client";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { TrashView } from "@/components/workspace/TrashView";
import { useSession } from "@/contexts/SessionContext";

export default function WorkspaceTrashPage() {
  const { session } = useSession();
  const tenantId = session?.tenantId || "";

  return (
    <WorkspaceShell title="Trash" subtitle="Restore documents or remove them permanently">
      {tenantId ? <TrashView tenantId={tenantId} basePath="/workspace" /> : <LoadingBlock />}
    </WorkspaceShell>
  );
}
