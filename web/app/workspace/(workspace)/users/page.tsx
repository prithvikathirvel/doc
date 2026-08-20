"use client";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { UsersView } from "@/components/workspace/UsersView";
import { useSession } from "@/contexts/SessionContext";

export default function WorkspaceUsersPage() {
  const { session } = useSession();
  const tenantId = session?.tenantId || "";

  return (
    <WorkspaceShell title="People" subtitle="Team members and the documents they own">
      {tenantId ? <UsersView tenantId={tenantId} basePath="/workspace" /> : <LoadingBlock />}
    </WorkspaceShell>
  );
}
