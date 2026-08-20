"use client";

import { use } from "react";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { UserDocumentsView } from "@/components/workspace/UserDocumentsView";
import { useSession } from "@/contexts/SessionContext";

export default function WorkspaceUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const decoded = decodeURIComponent(userId);
  const { session } = useSession();
  const tenantId = session?.tenantId || "";

  return (
    <WorkspaceShell title={decoded} subtitle="Documents owned by this person">
      {tenantId ? (
        <UserDocumentsView tenantId={tenantId} basePath="/workspace" userId={decoded} />
      ) : (
        <LoadingBlock />
      )}
    </WorkspaceShell>
  );
}
