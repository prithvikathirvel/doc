"use client";

import { Suspense } from "react";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { LoadingBlock } from "@/components/ui/Feedback";
import { FilesView } from "@/components/workspace/FilesView";
import { useSession } from "@/contexts/SessionContext";

export default function WorkspaceFilesPage() {
  const { session, tenant } = useSession();
  const tenantId = session?.tenantId || "";

  return (
    <WorkspaceShell title="Files" subtitle="Folders and documents in this workspace">
      {tenantId ? (
        <Suspense fallback={<LoadingBlock />}>
          <FilesView
            tenantId={tenantId}
            basePath="/workspace"
            maxFileSizeBytes={tenant?.maxFileSizeBytes}
          />
        </Suspense>
      ) : (
        <LoadingBlock />
      )}
    </WorkspaceShell>
  );
}
