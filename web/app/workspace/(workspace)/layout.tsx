import type { ReactNode } from "react";
import { WorkspaceChrome } from "@/components/layout/WorkspaceChrome";

export default function WorkspaceAppLayout({ children }: { children: ReactNode }) {
  return <WorkspaceChrome>{children}</WorkspaceChrome>;
}
